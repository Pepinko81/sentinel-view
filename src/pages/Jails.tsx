import { useState, useMemo } from "react";
import { Shield, AlertCircle, RefreshCw, Power } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { JailTable } from "@/components/jails/JailTable";
import { JailFilters } from "@/components/jails/JailFilters";
import { BanHistory } from "@/components/jails/BanHistory";
import { FilterCreator } from "@/components/jails/FilterCreator";
import { RefreshIndicator } from "@/components/dashboard/RefreshIndicator";
import { useJails } from "@/hooks/useJails";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export default function Jails() {
  const {
    jails,
    stats,
    lastUpdated,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
    unbanIP,
    startJail,
    stopJail,
    restartFail2ban,
    isStarting,
    isStopping,
    isRestarting,
  } = useJails();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredJails = useMemo(() => {
    return jails.filter((jail) => {
      const matchesSearch = jail.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" ||
        (jail.category || "Other") === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && jail.enabled) ||
        (statusFilter === "disabled" && !jail.enabled);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [jails, searchQuery, categoryFilter, statusFilter]);

  // Group jails by category
  const groupedJails = useMemo(() => {
    const groups: Record<string, typeof jails> = {};
    filteredJails.forEach((jail) => {
      const category = jail.category || "Other";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(jail);
    });
    return groups;
  }, [filteredJails]);

  const handleUnban = (jailName: string, ip: string) => {
    unbanIP({ jailName, ip });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="keynote-title font-mono text-foreground terminal-glow">
              <span className="text-[var(--accent)]">&gt;</span> Jails
            </h1>
            <p className="keynote-subtitle font-mono text-muted-foreground mt-2">
              Manage fail2ban jails and banned IPs
            </p>
          </div>
          {!isLoading && (
            <div className="flex items-center gap-3">
              <RefreshIndicator
                lastUpdated={lastUpdated}
                isRefetching={isRefetching}
                onRefresh={refetch}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRestarting}
                    className="font-mono"
                  >
                    <Power className={`h-4 w-4 mr-2 ${isRestarting ? "animate-spin" : ""}`} />
                    {isRestarting ? "Restarting..." : "Restart Fail2ban"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restart Fail2ban Service</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restart the fail2ban service. All jails will be temporarily unavailable during the restart process (typically 2-5 seconds).
                      <br />
                      <br />
                      <strong>Are you sure you want to continue?</strong>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => restartFail2ban()}
                      disabled={isRestarting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isRestarting ? "Restarting..." : "Restart Service"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Error State */}
        {isError && (
          <Alert variant="destructive" className="keynote-glass fade-in-keynote">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load jails</AlertTitle>
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

        {/* Filters - Only show if not loading and not error */}
        {!isLoading && !isError && (
          <JailFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            categories={stats?.categories ?? []}
          />
        )}

        {/* Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="keynote-tabs font-mono">
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-4">
            {/* Results count */}
            {!isLoading && !isError && (
              <div className="font-mono text-xs text-muted-foreground">
                Showing {filteredJails.length} of {jails.length} jails
              </div>
            )}

            {/* Jails Table */}
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 bg-muted/50" />
                <Skeleton className="h-64 bg-muted/50" />
              </div>
            ) : isError ? (
              // Empty state when error
              <div className="keynote-glass fade-in-keynote p-6">
                <div className="relative z-10 text-center text-muted-foreground">
                  <p className="font-mono text-sm">Unable to load jails data</p>
                </div>
              </div>
            ) : jails.length === 0 ? (
              // Empty state when no jails
              <div className="keynote-glass fade-in-keynote p-6">
                <div className="relative z-10 text-center text-muted-foreground">
                  <p className="font-mono text-sm">No jails configured</p>
                </div>
              </div>
            ) : filteredJails.length === 0 ? (
              // Empty state when filters match nothing
              <div className="keynote-glass fade-in-keynote p-6">
                <div className="relative z-10 text-center text-muted-foreground">
                  <p className="font-mono text-sm">No jails match the current filters</p>
                </div>
              </div>
            ) : categoryFilter !== "all" || searchQuery ? (
              // Flat list when filtering
              <JailTable
                jails={filteredJails}
                onStartJail={startJail}
                onStopJail={stopJail}
                onUnbanIP={handleUnban}
                isStarting={isStarting}
                isStopping={isStopping}
              />
            ) : (
              // Grouped by category
              <div className="space-y-6">
                {Object.entries(groupedJails).map(([category, categoryJails]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-secondary" />
                      <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-secondary">
                        {category}
                      </h2>
                      <span className="font-mono text-xs text-muted-foreground">
                        ({categoryJails.length})
                      </span>
                    </div>
                    <JailTable
                      jails={categoryJails}
                      onStartJail={startJail}
                      onStopJail={stopJail}
                      onUnbanIP={handleUnban}
                      isStarting={isStarting}
                      isStopping={isStopping}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <BanHistory />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
