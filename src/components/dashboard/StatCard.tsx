import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  variant = "default",
}: StatCardProps) {
  const variantStyles = {
    default: "border-border",
    success: "border-success/50",
    warning: "border-warning/50",
    destructive: "border-destructive/50",
  };

  const iconStyles = {
    default: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  return (
    <div
      className={cn(
        "terminal-card relative overflow-hidden p-6 animate-fade-in",
        variantStyles[variant]
      )}
    >
      <div className="scanlines" />
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground terminal-glow">
              {value}
            </p>
            {description && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded bg-muted",
              iconStyles[variant]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
