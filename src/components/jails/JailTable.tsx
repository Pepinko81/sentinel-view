import { useState, Fragment } from "react";
import { ChevronDown, ChevronRight, Power, PowerOff } from "lucide-react";
import { Jail } from "@/types/jail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IPList } from "./IPList";
import { cn } from "@/lib/utils";

interface JailTableProps {
  jails: Jail[];
  onToggleJail: (jailName: string) => void;
  onUnbanIP: (jailName: string, ip: string) => void;
  isToggling?: boolean;
}

export function JailTable({
  jails,
  onToggleJail,
  onUnbanIP,
  isToggling,
}: JailTableProps) {
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
              Banned IPs
            </th>
            <th className="p-3 text-right font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {jails.map((jail) => {
            const isExpanded = expandedJails.has(jail.name);
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
                      disabled={jail.bannedIPs.length === 0}
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
                        jail.bannedIPs.length > 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {jail.bannedIPs.length}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleJail(jail.name)}
                      disabled={isToggling}
                      className="font-mono text-xs"
                    >
                      {jail.enabled ? (
                        <>
                          <PowerOff className="mr-1 h-3 w-3" />
                          Disable
                        </>
                      ) : (
                        <>
                          <Power className="mr-1 h-3 w-3" />
                          Enable
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
                {isExpanded && jail.bannedIPs.length > 0 && (
                  <tr>
                    <td colSpan={6} className="bg-muted/10 p-0">
                      <IPList
                        ips={jail.bannedIPs}
                        jailName={jail.name}
                        onUnban={onUnbanIP}
                      />
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
