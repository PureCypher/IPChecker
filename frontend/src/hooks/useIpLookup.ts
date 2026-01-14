import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { LookupRequest } from '@ipintel/shared';

/**
 * Hook for IP lookup mutation
 */
export function useIpLookup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: LookupRequest) => apiClient.lookupIp(request),
    onSuccess: () => {
      // Invalidate system health to update provider stats
      queryClient.invalidateQueries({ queryKey: ['systemHealth'] });
    },
  });
}

/**
 * Hook for system health query
 */
export function useSystemHealth() {
  return useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => apiClient.getSystemHealth(),
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });
}

/**
 * Hook for providers health query
 */
export function useProvidersHealth() {
  return useQuery({
    queryKey: ['providersHealth'],
    queryFn: () => apiClient.getProvidersHealth(),
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
