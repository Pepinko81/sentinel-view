import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  fetchServer,
  unbanServerIP,
  executeServerAction,
  Server,
} from "@/lib/apiService";
import {
  AlertCircle,
  ArrowLeft,
  Wifi,
  WifiOff,
  Clock,
  Shield,
  Ban,
  RefreshCw,
  Play,
  Square,
  RotateCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false);
  const [selectedUnban, setSelectedUnban] = useState<{ jail: string; ip: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["server", id],
    queryFn: () => fetchServer(id!),
    enabled: !!id,
    refetchInterval: 30000,
  });

  const unbanMutation = useMutation({
    mutationFn: ({ jail, ip }: { jail: string; ip: string }) =>
      unbanServerIP(id!, jail, ip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast({
        title: "IP Unbanned",
        description: `${selectedUnban?.ip} has been unbanned from ${selectedUnban?.jail}`,
      });
      setUnbanDialogOpen(false);
      setSelectedUnban(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Unban Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, jailName }: { action: "start" | "stop" | "restart" | "restart_fail2ban"; jailName?: string }) =>
      executeServerAction(id!, action, jailName),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast({
        title: "Action Executed",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Action Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleUnban = (jail: string, ip: string) => {
    setSelectedUnban({ jail, ip });
    setUnbanDialogOpen(true);
  };

  const confirmUnban = () => {
    if (selectedUnban) {
      unbanMutation.mutate(selectedUnban);
    }
  };

  const handleAction = (action: "start" | "stop" | "restart" | "restart_fail2ban", jailName?: string) => {
    actionMutation.mutate({ action, jailName });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (isError || !data) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Alert variant="destructive" className="keynote-glass fade-in-keynote">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load server</AlertTitle>
            <AlertDescription className="mt-2">
              {error instanceof Error ? error.message : "Server not found"}
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  const server = data.server;
  
  // Debug: Log server data to console
  useEffect(() => {
    if (server) {
      console.log('[ServerDetail] Server data:', {
        id: server.id,
        name: server.name,
        online: server.online,
        jailsCount: server.jails?.length || 0,
        bansCount: server.bans?.length || 0,
        hasJails: !!server.jails,
        hasBans: !!server.bans,
        jails: server.jails,
        bans: server.bans,
      });
    }
  }, [server]);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/servers")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="keynote-title font-mono text-foreground terminal-glow">
              <span className="text-[var(--accent)]">&gt;</span> {server.name}
            </h1>
            <p className="keynote-subtitle font-mono text-muted-foreground mt-2">
              {server.ip || "No IP address"}
            </p>
          </div>
        </div>

        {/* Status Card */}
        <Card className="keynote-glass fade-in-keynote p-6">
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div className="flex items-center gap-3">
              {server.online ? (
                <Wifi className="h-6 w-6 text-green-500" />
              ) : (
                <WifiOff className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-mono text-xs text-muted-foreground">Status</p>
                <p className="font-mono font-semibold">
                  {server.online ? "Online" : "Offline"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="font-mono text-xs text-muted-foreground">Last Seen</p>
                <p className="font-mono font-semibold">
                  {formatTimestamp(server.lastSeen)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Ban className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="font-mono text-xs text-muted-foreground">Active Bans</p>
                <p className="keynote-number font-mono font-semibold">
                  {server.bans?.length || 0}
                </p>
              </div>
            </div>
          </div>
          
          {/* Server Actions */}
          {server.online && (
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground">Server Actions</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("restart_fail2ban")}
                disabled={actionMutation.isPending}
                className="font-mono"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Restart Fail2ban
              </Button>
            </div>
          )}
        </Card>

        {/* Jails Table */}
        <Card className="keynote-glass fade-in-keynote p-6">
          <h2 className="font-mono text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Jails
            {server.jails && server.jails.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground ml-2">
                ({server.jails.length})
              </span>
            )}
          </h2>
          {server.jails && server.jails.length > 0 ? (
            <div className="keynote-table overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bans</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {server.jails.map((jail) => (
                    <TableRow key={jail.name}>
                      <TableCell className="font-mono">{jail.name}</TableCell>
                      <TableCell>
                        <span
                          className={`font-mono text-xs px-2 py-1 rounded ${
                            jail.enabled
                              ? "bg-green-500/20 text-green-500"
                              : "bg-gray-500/20 text-gray-500"
                          }`}
                        >
                          {jail.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">
                        {jail.bans || 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!server.online ? (
                            <span className="font-mono text-xs text-muted-foreground">
                              Offline
                            </span>
                          ) : jail.enabled ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction("stop", jail.name)}
                                disabled={actionMutation.isPending}
                                className="font-mono"
                              >
                                <Square className="h-3 w-3 mr-1" />
                                Stop
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction("restart", jail.name)}
                                disabled={actionMutation.isPending}
                                className="font-mono"
                              >
                                <RotateCw className="h-3 w-3 mr-1" />
                                Restart
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAction("start", jail.name)}
                              disabled={actionMutation.isPending}
                              className="font-mono"
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Start
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-mono text-muted-foreground">No jails data available</p>
              <p className="font-mono text-xs text-muted-foreground mt-2">
                {server.jails === undefined 
                  ? "Waiting for agent to send data..." 
                  : "No jails found on this server"}
              </p>
            </div>
          )}
        </Card>

        {/* Active Bans */}
        <Card className="keynote-glass fade-in-keynote p-6">
          <h2 className="font-mono text-lg font-semibold mb-4 flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Active Bans
            {server.bans && server.bans.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground ml-2">
                ({server.bans.length})
              </span>
            )}
          </h2>
          {server.bans && server.bans.length > 0 ? (
            <div className="keynote-table overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jail</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {server.bans.map((ban, index) => (
                    <TableRow key={`${ban.jail}-${ban.ip}-${index}`}>
                      <TableCell className="font-mono">{ban.jail}</TableCell>
                      <TableCell className="font-mono font-semibold">{ban.ip}</TableCell>
                      <TableCell>
                        {!server.online ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            Offline
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnban(ban.jail, ban.ip)}
                            disabled={unbanMutation.isPending}
                            className="font-mono"
                          >
                            Unban
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Ban className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-mono text-muted-foreground">No active bans</p>
              <p className="font-mono text-xs text-muted-foreground mt-2">
                {server.bans === undefined 
                  ? "Waiting for agent to send data..." 
                  : "No IPs are currently banned"}
              </p>
            </div>
          )}
        </Card>

        {/* Log Tail */}
        {server.logTail && server.logTail.length > 0 && (
          <Card className="keynote-glass fade-in-keynote p-6">
            <h2 className="font-mono text-lg font-semibold mb-4">Recent Logs</h2>
            <div className="font-mono text-xs bg-black/50 p-4 rounded overflow-x-auto max-h-96 overflow-y-auto">
              {server.logTail.map((line, index) => (
                <div key={index} className="text-muted-foreground mb-1">
                  {line}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Unban Dialog */}
        <AlertDialog open={unbanDialogOpen} onOpenChange={setUnbanDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unban IP Address</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to unban {selectedUnban?.ip} from {selectedUnban?.jail}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmUnban} disabled={unbanMutation.isPending}>
                {unbanMutation.isPending ? "Unbanning..." : "Unban"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

