import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPendingInvite,
  deleteAccount,
  fetchAccounts,
  fetchPendingInvites,
  revokePendingInvite,
  updateAccount,
  type AccountPatch,
} from "@/data/account-api";
import type { AccountRole } from "@/lib/session";
import { CURRENT_ACCOUNT_KEY } from "@/lib/session";

const ACCOUNTS_KEY = ["accounts"] as const;
const PENDING_INVITES_KEY = ["pending-invites"] as const;

// Same near-real-time approach as employee-store.ts (15s background
// refetch) — two admins can have this page open at once.
const REALTIME_POLL_MS = 15_000;

/** `enabled` should be gated to `currentAccount?.role === "admin"` by the
 * caller — the backend 403s a non-admin anyway, but there's no reason to
 * fire the request (and log the noisy error) for a role that can never see
 * this page's nav item in the first place. */
export function useAccountsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: fetchAccounts,
    enabled,
    refetchInterval: enabled ? REALTIME_POLL_MS : false,
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      // The Active Sessions panel lists every account too.
      queryClient.invalidateQueries({ queryKey: ["account-presence"] });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AccountPatch }) => updateAccount(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      // Covers the edge case of an admin editing their own row (blocked
      // server-side for role/active, but display_name/photo_url still go
      // through) or another admin's row affecting the signed-in menu.
      queryClient.invalidateQueries({ queryKey: CURRENT_ACCOUNT_KEY });
    },
  });
}

/** Same `enabled` contract as useAccountsQuery above — gate to
 * `currentAccount?.role === "admin"` at the call site. */
export function usePendingInvitesQuery(enabled: boolean) {
  return useQuery({
    queryKey: PENDING_INVITES_KEY,
    queryFn: fetchPendingInvites,
    enabled,
    refetchInterval: enabled ? REALTIME_POLL_MS : false,
  });
}

export function useCreatePendingInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: AccountRole }) =>
      createPendingInvite(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_INVITES_KEY });
    },
  });
}

export function useRevokePendingInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokePendingInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_INVITES_KEY });
    },
  });
}
