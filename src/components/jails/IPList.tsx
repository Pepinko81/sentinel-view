import { useState } from "react";
import { Copy, ExternalLink, Ban, Check } from "lucide-react";
import { BannedIP } from "@/types/jail";
import { Button } from "@/components/ui/button";
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

interface IPListProps {
  ips: BannedIP[];
  jailName: string;
  onUnban: (jailName: string, ip: string) => void;
}

export function IPList({ ips, jailName, onUnban }: IPListProps) {
  const [copiedIP, setCopiedIP] = useState<string | null>(null);

  const copyToClipboard = async (ip: string) => {
    await navigator.clipboard.writeText(ip);
    setCopiedIP(ip);
    setTimeout(() => setCopiedIP(null), 2000);
  };

  const openWhois = (ip: string) => {
    window.open(`https://who.is/whois-ip/ip-address/${ip}`, "_blank");
  };

  return (
    <div className="p-4">
      <div className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Banned IPs ({ips.length})
      </div>
      <div className="space-y-2">
        {ips.map((banned) => (
          <div
            key={banned.ip}
            className="flex items-center justify-between rounded border border-border/50 bg-background/50 px-3 py-2 animate-slide-in"
          >
            <div className="flex items-center gap-4">
              <code className="font-mono text-sm text-foreground">
                {banned.ip}
              </code>
              <span className="font-mono text-xs text-muted-foreground">
                Active ban (runtime)
              </span>
              {banned.banCount > 1 && (
                <span className="font-mono text-xs text-warning">
                  ×{banned.banCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => copyToClipboard(banned.ip)}
                title="Copy IP"
              >
                {copiedIP === banned.ip ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openWhois(banned.ip)}
                title="WHOIS Lookup"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Unban IP"
                  >
                    <Ban className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="terminal-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-mono text-foreground">
                      Confirm Unban
                    </AlertDialogTitle>
                    <AlertDialogDescription className="font-mono text-muted-foreground">
                      Are you sure you want to unban{" "}
                      <code className="text-primary">{banned.ip}</code> from{" "}
                      <code className="text-secondary">{jailName}</code>?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="font-mono">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onUnban(jailName, banned.ip)}
                      className="bg-destructive text-destructive-foreground font-mono hover:bg-destructive/90"
                    >
                      Unban
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
