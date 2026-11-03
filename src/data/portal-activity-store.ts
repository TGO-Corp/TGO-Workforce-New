import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchPortalFeed, fetchPortalSummary, syncPortalNow } from "@/data/portal-activity-api";

const PORTAL_KEY = ["portal-activity"] as const;

// "Realtime": Workforce's API polls the portal every ~20s and this re-reads its
// own database every 8s, so an event shows up on the Dashboard within about half
// a minute of happening in the portal.
const LIVE_POLL_MS = 8_000;

export function usePortalFeedQuery(enabled: boolean, limit = 12) {
  return useQuery({
    queryKey: [...PORTAL_KEY, "feed", limit],
    queryFn: () => fetchPortalFeed(limit),
    enabled,
    refetchInterval: enabled ? LIVE_POLL_MS : false,
    placeholderData: keepPreviousData,
  });
}

export function usePortalSummaryQuery(enabled: boolean) {
  return useQuery({
    queryKey: [...PORTAL_KEY, "summary"],
    queryFn: fetchPortalSummary,
    enabled,
    refetchInterval: enabled ? LIVE_POLL_MS : false,
  });
}

export function useSyncPortalNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncPortalNow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PORTAL_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
