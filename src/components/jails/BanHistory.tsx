import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBanHistory } from "@/lib/apiService";
import { format, formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useJails } from "@/hooks/useJails";

interface BanHistoryProps {
  selectedJail?: string | null;
}

export function BanHistory({ selectedJail = null }: BanHistoryProps) {
  const { jails } = useJails();
  const [jailFilter, setJailFilter] = useState<string | null>(selectedJail);
  const [limit, setLimit] = useState(50);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["banHistory", jailFilter, limit],
    queryFn: () => fetchBanHistory(jailFilter || undefined, limit),
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000,
  });

  const events = data?.events || [];
  const uniqueJails = Array.from(new Set(jails.map((j) => j.name))).sort();

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case "ban":
        return "destructive";
      case "unban":
        return "default";
      case "restore":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 bg-muted/50" />
        <Skeleton className="h-64 bg-muted/50" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load ban history</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-2">
            {error instanceof Error
              ? error.message
              : "Unable to read fail2ban log file."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-2"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Filter by Jail
          </label>
          <Select
            value={jailFilter || "all"}
            onValueChange={(value) => setJailFilter(value === "all" ? null : value)}
          >
            <SelectTrigger className="font-mono">
              <SelectValue placeholder="All jails" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jails</SelectItem>
              {uniqueJails.map((jailName) => (
                <SelectItem key={jailName} value={jailName}>
                  {jailName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-32">
          <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Limit
          </label>
          <Select
            value={limit.toString()}
            onValueChange={(value) => setLimit(parseInt(value, 10))}
          >
            <SelectTrigger className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <div className="font-mono text-xs text-muted-foreground">
        Showing {events.length} of {data?.total ?? 0} events
        {jailFilter && ` for ${jailFilter}`}
      </div>

      {/* Events table */}
      {events.length === 0 ? (
        <div className="terminal-card p-6">
          <div className="scanlines" />
          <div className="relative z-10 text-center text-muted-foreground">
            <p className="font-mono text-sm">No ban history found</p>
          </div>
        </div>
      ) : (
        <div className="terminal-card overflow-hidden">
          <div className="scanlines" />
          <table className="relative z-10 w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Timestamp
                </th>
                <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Jail
                </th>
                <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  IP Address
                </th>
                <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr
                  key={`${event.timestamp}-${event.ip}-${index}`}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="p-3">
                    <div className="font-mono text-sm text-foreground">
                      {format(new Date(event.timestamp), "yyyy-MM-dd HH:mm:ss")}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.timestamp), {
                        addSuffix: true,
                      })}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-sm text-foreground">
                      {event.jail}
                    </span>
                  </td>
                  <td className="p-3">
                    <code className="font-mono text-sm text-foreground">
                      {event.ip}
                    </code>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={getActionBadgeVariant(event.action)}
                      className="font-mono text-xs uppercase"
                    >
                      {event.action}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

