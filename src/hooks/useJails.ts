import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJails, unbanIP, toggleJail, banIP, calculateStats } from "@/lib/apiService";
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
    onSuccess: (_, { ip }) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "IP Unbanned",
        description: `Successfully unbanned ${ip}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unban IP",
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (jailName: string) => toggleJail(jailName),
    onSuccess: (_, jailName) => {
      queryClient.invalidateQueries({ queryKey: ["jails"] });
      toast({
        title: "Jail Updated",
        description: `${jailName} status changed`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle jail",
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
    toggleJail: toggleMutation.mutate,
    banIP: banMutation.mutate,
    isUnbanning: unbanMutation.isPending,
    isToggling: toggleMutation.isPending,
  };
};
