import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBanHistory } from "@/lib/apiService";
import { format, formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [jailInput, setJailInput] = useState<string>(selectedJail || "");
  const [limit, setLimit] = useState(50);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["banHistory", jailFilter, limit],
    queryFn: () => fetchBanHistory(jailFilter || undefined, limit),
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000,
  });

  const events = data?.events || [];
  const uniqueJails = Array.from(new Set(jails.map((j) => j.name))).sort();

  // Filter jails based on input
  const filteredJails = useMemo(() => {
    if (!jailInput.trim()) return uniqueJails;
    const searchLower = jailInput.toLowerCase();
    return uniqueJails.filter((jail) =>
      jail.toLowerCase().includes(searchLower)
    );
  }, [jailInput, uniqueJails]);

  const handleJailInputChange = (value: string) => {
    setJailInput(value);
    setShowSuggestions(true);
    // If exact match, set filter immediately
    if (uniqueJails.includes(value)) {
      setJailFilter(value);
    } else if (value === "") {
      setJailFilter(null);
    }
  };

  const handleJailSelect = (jailName: string) => {
    setJailInput(jailName);
    setJailFilter(jailName);
    setShowSuggestions(false);
  };

  const handleClearJail = () => {
    setJailInput("");
    setJailFilter(null);
    setShowSuggestions(false);
  };

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
        <div className="flex-1 relative">
          <label className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Filter by Jail
          </label>
          <div className="relative">
            <Input
              type="text"
              value={jailInput}
              onChange={(e) => handleJailInputChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              placeholder="Type jail name or leave empty for all..."
              className="font-mono pr-8"
            />
            {jailInput && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={handleClearJail}
                title="Clear filter"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {showSuggestions && filteredJails.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredJails.slice(0, 20).map((jailName) => (
                  <button
                    key={jailName}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted font-mono text-sm transition-colors"
                    onClick={() => handleJailSelect(jailName)}
                  >
                    {jailName}
                  </button>
                ))}
                {filteredJails.length > 20 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground font-mono">
                    ... and {filteredJails.length - 20} more
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            {jailFilter
              ? `Filtering by: ${jailFilter}`
              : "Showing all jails (type to filter)"}
          </p>
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

