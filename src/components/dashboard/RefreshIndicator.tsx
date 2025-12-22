import { RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface RefreshIndicatorProps {
  lastUpdated: string | null;
  isRefetching: boolean;
  onRefresh: () => void;
  refreshInterval?: number;
}

export function RefreshIndicator({
  lastUpdated,
  isRefetching,
  onRefresh,
  refreshInterval = 30,
}: RefreshIndicatorProps) {
  const [countdown, setCountdown] = useState(refreshInterval);

  useEffect(() => {
    setCountdown(refreshInterval);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : refreshInterval));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated, refreshInterval]);

  const formattedTime = lastUpdated
    ? formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })
    : "Never";

  return (
    <div className="flex items-center gap-4 font-mono text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>Updated {formattedTime}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-xs">Next refresh: {countdown}s</span>
        <div
          className="h-1 w-16 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={countdown}
          aria-valuemax={refreshInterval}
        >
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / refreshInterval) * 100}%` }}
          />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isRefetching}
        className="font-mono text-xs"
      >
        <RefreshCw className={cn("mr-2 h-3 w-3", isRefetching && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}

import { cn } from "@/lib/utils";
