import { Shield, ShieldAlert, ShieldCheck, ShieldOff, Activity, AlertCircle, RefreshCw, Power } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { RefreshIndicator } from "@/components/dashboard/RefreshIndicator";
import { useJails } from "@/hooks/useJails";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export default function Dashboard() {
  const { stats, lastUpdated, serverStatus, isLoading, isRefetching, isError, error, refetch, restartFail2ban, isRestarting } =
    useJails();

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-2xl font-bold text-foreground terminal-glow">
              <span className="text-primary">&gt;</span> Dashboard
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              Security monitoring overview
            </p>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-2">
              <RefreshIndicator
                lastUpdated={lastUpdated}
                isRefetching={isRefetching}
                onRefresh={refetch}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Power className="h-4 w-4 mr-2" />
                    Restart Fail2ban
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restart Fail2ban?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restart the fail2ban service. All jails with enabled=true will be started.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => restartFail2ban()}
                      disabled={isRestarting}
                    >
                      {isRestarting ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Restarting...
                        </>
                      ) : (
                        "Restart"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Server Status */}
        <div className="flex items-center gap-2 font-mono text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              serverStatus === "online" ? "bg-success pulse-glow" : "bg-destructive"
            }`}
          />
          <span className="text-muted-foreground">Server Status:</span>
          <span
            className={
              serverStatus === "online" ? "text-success" : "text-destructive"
            }
          >
            {serverStatus.toUpperCase()}
          </span>
        </div>

        {/* Error State */}
        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load data</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-2">
                {error instanceof Error ? error.message : "Unable to connect to the backend API."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="mt-2"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-32 bg-muted/50"
              />
            ))}
          </div>
        ) : isError ? (
          // Show empty state when error
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Banned IPs"
              value={0}
              icon={ShieldAlert}
              description="Data unavailable"
              variant="default"
            />
            <StatCard
              title="Active Jails"
              value={0}
              icon={Shield}
              description="Data unavailable"
              variant="default"
            />
            <StatCard
              title="Enabled Jails"
              value={0}
              icon={ShieldCheck}
              description="Data unavailable"
              variant="default"
            />
            <StatCard
              title="Disabled Jails"
              value={0}
              icon={ShieldOff}
              description="Data unavailable"
              variant="default"
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Banned IPs"
              value={stats?.totalBannedIPs ?? 0}
              icon={ShieldAlert}
              description="Across all jails"
              variant="destructive"
            />
            <StatCard
              title="Active Jails"
              value={stats?.activeJails ?? 0}
              icon={Shield}
              description="Total configured"
              variant="default"
            />
            <StatCard
              title="Enabled Jails"
              value={stats?.enabledJails ?? 0}
              icon={ShieldCheck}
              description="Currently protecting"
              variant="success"
            />
            <StatCard
              title="Disabled Jails"
              value={stats?.disabledJails ?? 0}
              icon={ShieldOff}
              description="Inactive protection"
              variant="warning"
            />
          </div>
        )}

        {/* Categories */}
        {!isError && stats && stats.categories.length > 0 && (
          <div className="terminal-card p-6">
            <div className="scanlines" />
            <div className="relative z-10">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-foreground">
                  Active Categories
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.categories.map((category) => (
                  <span
                    key={category}
                    className="rounded border border-secondary/50 bg-secondary/10 px-3 py-1 font-mono text-xs text-secondary"
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State - No Categories */}
        {!isLoading && !isError && stats && stats.categories.length === 0 && (
          <div className="terminal-card p-6">
            <div className="scanlines" />
            <div className="relative z-10 text-center text-muted-foreground">
              <p className="font-mono text-sm">No active categories found</p>
            </div>
          </div>
        )}

        {/* System Info */}
        {!isError && (
          <div className="terminal-card p-6">
            <div className="scanlines" />
            <div className="relative z-10 font-mono text-xs text-muted-foreground">
              <div className="space-y-1">
                <p>
                  <span className="text-primary">$</span> fail2ban-client status
                </p>
                <p className="pl-4">
                  Status: <span className={serverStatus === "online" ? "text-success" : "text-destructive"}>{serverStatus === "online" ? "OK" : "OFFLINE"}</span>
                </p>
                <p className="pl-4">
                  Number of jails:{" "}
                  <span className="text-foreground">{stats?.activeJails ?? 0}</span>
                </p>
                <p className="pl-4">
                  Total banned:{" "}
                  <span className="text-destructive">
                    {stats?.totalBannedIPs ?? 0}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
