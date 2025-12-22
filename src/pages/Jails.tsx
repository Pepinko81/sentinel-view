import { useState, useMemo } from "react";
import { Shield, AlertCircle, RefreshCw } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { JailTable } from "@/components/jails/JailTable";
import { JailFilters } from "@/components/jails/JailFilters";
import { RefreshIndicator } from "@/components/dashboard/RefreshIndicator";
import { useJails } from "@/hooks/useJails";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    toggleJail,
    isToggling,
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
            <h1 className="font-mono text-2xl font-bold text-foreground terminal-glow">
              <span className="text-primary">&gt;</span> Jails
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              Manage fail2ban jails and banned IPs
            </p>
          </div>
          {!isLoading && (
            <RefreshIndicator
              lastUpdated={lastUpdated}
              isRefetching={isRefetching}
              onRefresh={refetch}
            />
          )}
        </div>

        {/* Error State */}
        {isError && (
          <Alert variant="destructive">
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
          <div className="terminal-card p-6">
            <div className="scanlines" />
            <div className="relative z-10 text-center text-muted-foreground">
              <p className="font-mono text-sm">Unable to load jails data</p>
            </div>
          </div>
        ) : jails.length === 0 ? (
          // Empty state when no jails
          <div className="terminal-card p-6">
            <div className="scanlines" />
            <div className="relative z-10 text-center text-muted-foreground">
              <p className="font-mono text-sm">No jails configured</p>
            </div>
          </div>
        ) : filteredJails.length === 0 ? (
          // Empty state when filters match nothing
          <div className="terminal-card p-6">
            <div className="scanlines" />
            <div className="relative z-10 text-center text-muted-foreground">
              <p className="font-mono text-sm">No jails match the current filters</p>
            </div>
          </div>
        ) : categoryFilter !== "all" || searchQuery ? (
          // Flat list when filtering
          <JailTable
            jails={filteredJails}
            onToggleJail={toggleJail}
            onUnbanIP={handleUnban}
            isToggling={isToggling}
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
                  onToggleJail={toggleJail}
                  onUnbanIP={handleUnban}
                  isToggling={isToggling}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
