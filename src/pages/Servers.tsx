import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchServers, Server } from "@/lib/apiService";
import { AlertCircle, Server as ServerIcon, Wifi, WifiOff, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Servers() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["servers"],
    queryFn: fetchServers,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) {
      return "Just now";
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleString();
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="keynote-title font-mono text-foreground terminal-glow">
              <span className="text-[var(--accent)]">&gt;</span> Servers
            </h1>
            <p className="keynote-subtitle font-mono text-muted-foreground mt-2">
              Multi-server fail2ban monitoring
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        {/* Error State */}
        {isError && (
          <Alert variant="destructive" className="keynote-glass fade-in-keynote">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load servers</AlertTitle>
            <AlertDescription className="mt-2">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="keynote-glass fade-in-keynote p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-4 w-16" />
              </Card>
            ))}
          </div>
        )}

        {/* Servers List */}
        {!isLoading && !isError && data && (
          <>
            {data.servers.length === 0 ? (
              <Card className="keynote-glass fade-in-keynote p-8 text-center">
                <ServerIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-mono text-muted-foreground">No servers connected</p>
                <p className="font-mono text-sm text-muted-foreground mt-2">
                  Install the agent on remote servers to start monitoring
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.servers.map((server, index) => (
                  <Card
                    key={server.id}
                    className="keynote-glass fade-in-keynote p-6 cursor-pointer hover:border-[var(--accent)] transition-colors"
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => navigate(`/servers/${server.id}`)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        {server.online ? (
                          <Wifi className="h-5 w-5 text-green-500" />
                        ) : (
                          <WifiOff className="h-5 w-5 text-muted-foreground" />
                        )}
                        <h3 className="font-mono font-semibold text-lg">
                          {server.name}
                        </h3>
                      </div>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          server.online ? "bg-green-500" : "bg-gray-500"
                        }`}
                      />
                    </div>

                    <div className="space-y-2 font-mono text-sm">
                      {server.ip && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>IP:</span>
                          <span className="text-foreground">{server.ip}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{formatTimestamp(server.lastSeen)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Bans:</span>
                        <span className="keynote-number text-[var(--accent)]">
                          {server.bans || 0}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full mt-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/servers/${server.id}`);
                      }}
                    >
                      View Details
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}

