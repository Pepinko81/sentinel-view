import { useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, PowerOff, Power, FileCode } from "lucide-react";
import { Jail } from "@/types/jail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IPList } from "./IPList";
import { cn } from "@/lib/utils";

interface JailTableProps {
  jails: Jail[];
  onStartJail: (jailName: string) => void;
  onStopJail: (jailName: string) => void;
  onUnbanIP: (jailName: string, ip: string) => void;
  isStarting?: boolean;
  isStopping?: boolean;
}

export function JailTable({
  jails,
  onStartJail,
  onStopJail,
  onUnbanIP,
  isStarting,
  isStopping,
}: JailTableProps) {
  const navigate = useNavigate();
  const [expandedJails, setExpandedJails] = useState<Set<string>>(new Set());

  const toggleExpand = (jailName: string) => {
    setExpandedJails((prev) => {
      const next = new Set(prev);
      if (next.has(jailName)) {
        next.delete(jailName);
      } else {
        next.add(jailName);
      }
      return next;
    });
  };

  if (jails.length === 0) {
    return (
      <div className="terminal-card p-8 text-center">
        <p className="font-mono text-muted-foreground">No jails found</p>
      </div>
    );
  }

  return (
    <div className="terminal-card overflow-hidden">
      <div className="scanlines" />
      <table className="relative z-10 w-full">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="w-10 p-3" />
            <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Jail Name
            </th>
            <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Status
            </th>
            <th className="p-3 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Category
            </th>
            <th className="p-3 text-center font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <span title="Currently active banned IPs (runtime state)">Active Bans</span>
            </th>
            <th className="p-3 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {jails.map((jail) => {
            const isExpanded = expandedJails.has(jail.name);
            // Debug logging for jails with active bans
            if ((jail.active_bans?.count ?? jail.currently_banned ?? 0) > 0) {
              console.log(`[JailTable] ${jail.name}: active_bans=`, jail.active_bans, 'currently_banned=', jail.currently_banned, 'bannedIPs=', jail.bannedIPs);
            }
            return (
              <Fragment key={jail.name}>
                <tr
                  className={cn(
                    "border-b border-border/50 transition-colors hover:bg-muted/30",
                    isExpanded && "bg-muted/20"
                  )}
                >
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleExpand(jail.name)}
                      disabled={(jail.active_bans?.count ?? jail.currently_banned ?? 0) === 0}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-primary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-sm text-foreground">
                      {jail.name}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={jail.enabled ? "default" : "secondary"}
                      className={cn(
                        "font-mono text-xs",
                        jail.enabled
                          ? "bg-success/20 text-success hover:bg-success/30"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {jail.enabled ? "ENABLED" : "DISABLED"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs text-secondary border-secondary/50"
                    >
                      {jail.category || "Other"}
                    </Badge>
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={cn(
                        "font-mono text-sm font-bold",
                        (jail.active_bans?.count ?? jail.currently_banned ?? 0) > 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                      title={`Currently active banned IPs (runtime state): ${jail.active_bans?.count ?? jail.currently_banned ?? 0}`}
                    >
                      {jail.active_bans?.count ?? jail.currently_banned ?? 0}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/jail-editor/${jail.name}`)}
                        className="font-mono text-xs"
                        title="Edit jail configuration"
                      >
                        <FileCode className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      {jail.enabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onStopJail(jail.name)}
                          disabled={isStopping}
                          className="font-mono text-xs"
                        >
                          <PowerOff className="mr-1 h-3 w-3" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onStartJail(jail.name)}
                          disabled={isStarting}
                          className="font-mono text-xs"
                        >
                          <Power className="mr-1 h-3 w-3" />
                          Start
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {isExpanded && (jail.active_bans?.count ?? jail.currently_banned ?? 0) > 0 && (
                  <tr>
                    <td colSpan={6} className="bg-muted/10 p-4">
                      <div className="space-y-4">
                        {/* Active bans section */}
                        <div>
                          <h4 className="font-mono text-xs font-semibold text-foreground mb-2">
                            Active Bans (Runtime State)
                          </h4>
                          {jail.active_bans?.ips && jail.active_bans.ips.length > 0 ? (
                            <IPList
                              ips={jail.active_bans.ips.map(ip => ({ ip, bannedAt: '', banCount: 1 }))}
                              jailName={jail.name}
                              onUnban={onUnbanIP}
                            />
                          ) : (jail.bannedIPs && jail.bannedIPs.length > 0) ? (
                            <IPList
                              ips={jail.bannedIPs}
                              jailName={jail.name}
                              onUnban={onUnbanIP}
                            />
                          ) : (
                            <p className="text-muted-foreground text-sm font-mono">
                              No active banned IPs (count: {jail.active_bans?.count ?? jail.currently_banned ?? 0})
                            </p>
                          )}
                        </div>
                        
                        {/* Historical bans section (optional) */}
                        {jail.historical_bans?.total !== null && jail.historical_bans?.total !== undefined && (
                          <div className="pt-2 border-t border-border/50">
                            <p className="text-muted-foreground text-xs font-mono">
                              Total bans since start: <span className="font-semibold">{jail.historical_bans.total}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
