import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchJails, 
  unbanIP, 
  startJail,
  stopJail,
  banIP, 
  restartFail2ban, 
  calculateStats,
  createFilter,
  fetchBanHistory,
  CreateFilterPayload,
} from "@/lib/apiService";
import { useToast } from "@/hooks/use-toast";

const REFRESH_INTERVAL = 30000; // 30 seconds

export const useJails = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["jails"],
    queryFn: fetchJails,
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL - 5000,
    retry: 2, // Retry failed requests 2 times
    retryDelay: 1000, // Wait 1 second between retries
  });

  const stats = query.data ? calculateStats(query.data.jails) : null;

  const unbanMutation = useMutation({
    mutationFn: ({ jailName, ip }: { jailName: string; ip: string }) =>
      unbanIP(jailName, ip),
    onSuccess: (response, { jailName, ip }) => {
      // Invalidate and refetch only jails query (partial refresh)
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      queryClient.invalidateQueries({ queryKey: ["banHistory"] });
      toast({
        title: "IP Unbanned",
        description: response.message || `IP ${ip} unbanned from ${jailName}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unban Failed",
        description: error.message || "Failed to unban IP",
        variant: "destructive",
      });
    },
  });

  const createFilterMutation = useMutation({
    mutationFn: (payload: CreateFilterPayload) => createFilter(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Filter Created",
        description: response.message || "Filter created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create filter",
        variant: "destructive",
      });
    },
  });

  const startJailMutation = useMutation({
    mutationFn: (jailName: string) => startJail(jailName),
    onSuccess: (response, jailName) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Jail Started",
        description: response.message || `${jailName} started successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start jail",
        variant: "destructive",
      });
    },
  });

  const stopJailMutation = useMutation({
    mutationFn: (jailName: string) => stopJail(jailName),
    onSuccess: (response, jailName) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Jail Stopped",
        description: response.message || `${jailName} stopped successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop jail",
        variant: "destructive",
      });
    },
  });

  const banMutation = useMutation({
    mutationFn: ({ jailName, ip }: { jailName: string; ip: string }) =>
      banIP(jailName, ip),
    onSuccess: (_, { ip }) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "IP Banned",
        description: `Successfully banned ${ip}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to ban IP",
        variant: "destructive",
      });
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => restartFail2ban(),
    onSuccess: () => {
      // Invalidate and refetch jails after restart
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Fail2ban Restarted",
        description: "Service restarted successfully. Refreshing jail data...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Restart Failed",
        description: error.message || "Failed to restart fail2ban service",
        variant: "destructive",
      });
    },
  });

  // Ban history query
  const banHistoryQuery = useQuery({
    queryKey: ["banHistory"],
    queryFn: () => fetchBanHistory(),
    refetchInterval: REFRESH_INTERVAL,
    staleTime: REFRESH_INTERVAL - 5000,
    retry: 2,
    retryDelay: 1000,
  });

  return {
    jails: query.data?.jails ?? [],
    lastUpdated: query.data?.lastUpdated ?? null,
    serverStatus: query.data?.serverStatus ?? "offline",
    stats,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    unbanIP: unbanMutation.mutate,
    startJail: startJailMutation.mutate,
    stopJail: stopJailMutation.mutate,
    banIP: banMutation.mutate,
    restartFail2ban: restartMutation.mutate,
    createFilter: createFilterMutation.mutate,
    banHistory: banHistoryQuery.data?.events ?? [],
    isUnbanning: unbanMutation.isPending,
    isStarting: startJailMutation.isPending,
    isStopping: stopJailMutation.isPending,
    isRestarting: restartMutation.isPending,
    isCreatingFilter: createFilterMutation.isPending,
  };
};
