import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createApiKey,
  deleteApiKey,
  fetchApiKeys,
  fetchApiRequests,
  fetchApiScopes,
  fetchApiStats,
  revokeApiKey,
  type ApiKeyInput,
} from "@/data/api-access-api";

const API_ACCESS_KEY = ["api-access"] as const;

// "Live" on the Overview: a background refetch every 15s (same approach as
// @/data/backup-store), not a websocket.
const LIVE_POLL_MS = 15_000;

export function useApiScopesQuery() {
  return useQuery({
    queryKey: [...API_ACCESS_KEY, "scopes"],
    queryFn: fetchApiScopes,
    staleTime: 10 * 60_000,
  });
}

export function useApiKeysQuery() {
  return useQuery({
    queryKey: [...API_ACCESS_KEY, "keys"],
    queryFn: fetchApiKeys,
    refetchInterval: LIVE_POLL_MS,
  });
}

export function useApiStatsQuery(hours: number) {
  return useQuery({
    queryKey: [...API_ACCESS_KEY, "stats", hours],
    queryFn: () => fetchApiStats(hours),
    refetchInterval: LIVE_POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useApiRequestsQuery(params: {
  keyId?: string | undefined;
  outcome?: "ok" | "error" | undefined;
  limit: number;
  offset: number;
}) {
  return useQuery({
    queryKey: [...API_ACCESS_KEY, "requests", params],
    queryFn: () => fetchApiRequests(params),
    refetchInterval: LIVE_POLL_MS,
    placeholderData: keepPreviousData,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiKeyInput) => createApiKey(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_ACCESS_KEY }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_ACCESS_KEY }),
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_ACCESS_KEY }),
  });
}
