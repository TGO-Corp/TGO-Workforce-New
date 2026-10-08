import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAccountPresence, terminateSession } from "@/data/session-api";

const PRESENCE_KEY = ["account-presence"] as const;

// "Who's active right now" is the whole point of this panel, so it refreshes
// every few seconds (the rest of the app polls at 15s) — but only while the
// tab is actually visible, so a forgotten background tab costs nothing, and
// it refetches the instant you come back to the tab.
export const PRESENCE_POLL_MS = 3_000;

/** `enabled` should be false for anyone who isn't Super Admin — the backend
 * 403s otherwise, and there's no reason to poll a query that will only ever
 * error for the other five roles. */
export function useAccountPresenceQuery(enabled: boolean) {
  return useQuery({
    queryKey: PRESENCE_KEY,
    queryFn: fetchAccountPresence,
    enabled,
    refetchInterval: enabled ? PRESENCE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}

export function useTerminateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => terminateSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRESENCE_KEY }),
  });
}
