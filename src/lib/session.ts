// Real session, backed by the backend's signed httpOnly cookie (set by
// /auth/zoho/callback on a successful Zoho sign-in — see
// backend/app/api/routes/auth.py). There's nothing to store client-side:
// every check here just asks the backend "who is this cookie for, if
// anyone."

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import {
  ROLE_SWITCH_MIN_MS,
  ROLE_SWITCH_REDUCED_MS,
  beginRoleSwitch,
  endRoleSwitch,
  wait,
  type RoleSwitchTarget,
} from "@/lib/role-switch";

export type AccountRole =
  | "super_admin"
  | "admin"
  | "people_ops"
  | "hr"
  | "projects"
  | "recruitment_lead"
  | "onboarding_specialist"
  | "viewer";
export type Theme = "light" | "dark";

// Mirrors backend/app/models/permission.py's Permission enum exactly — the
// permission matrix's fixed catalog of module-level capabilities. See
// @/lib/permissions.ts for the hasPermission() helper this backs.
export type Permission =
  | "employees.view"
  | "employees.manage"
  | "milestones.view"
  | "onboarding.view"
  | "onboarding.manage"
  | "attendance.view"
  | "attendance.manage"
  | "attendance.approve"
  | "awards.view"
  | "awards.manage"
  | "benefits.view"
  | "benefits.manage"
  | "activity_logs.view"
  | "new_hires.view";

export type AccountProfile = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  role: AccountRole;
  is_active: boolean;
  // Distinct from is_active (which blocks sign-in entirely): a restricted
  // account can still sign in and see what its role normally would, but
  // every create/edit/delete/approve action is denied app-wide regardless
  // of role — see backend/app/services/permissions.py. Super Admin-only to
  // set (see the User Management page).
  is_restricted: boolean;
  last_login_at: string | null;
  // Non-null only for a genuine Super Admin with an active sandbox override
  // (see useEnterSandbox/useExitSandbox below) — `role` above always stays
  // the real persisted role; `permissions` is computed from whichever of the
  // two is currently in effect. Every admin/super-admin-gated page or nav
  // item should check getEffectiveRole(account) from @/lib/permissions, not
  // `role` directly, so sandboxing actually changes what's reachable.
  sandbox_role: AccountRole | null;
  // Every permission this account currently holds, computed server-side from
  // its role against the live matrix (see backend/app/services/permissions.py
  // and GET /auth/me) — admin/super_admin get every permission there is.
  // Nav gating, page-level access walls and canManageX() checks all read
  // this instead of hardcoding a role list, so they stay correct as soon as
  // a Super Admin edits the matrix, with no frontend redeploy needed.
  permissions: Permission[];
  // Personalization — see backend/app/schemas/account.py's
  // AccountPreferencesUpdate. Set by the signed-in person themselves (Profile
  // and Settings pages), never by an admin editing someone else's account.
  theme: Theme;
  default_office: string | null;
  notify_anniversaries: boolean;
  notify_birthdays: boolean;
  notify_new_hires: boolean;
  // Distinct from notify_new_hires above (Dashboard card visibility only) —
  // these two gate actual in-app notification-inbox events, relevant only to
  // roles that would ever receive them (see the Settings page).
  notify_on_violation_review: boolean;
  notify_on_new_hire_added: boolean;
  notify_on_hmo_member_added: boolean;
  // Gates page-enter transitions and dashboard count-up effects app-wide for
  // this account — purely cosmetic, so it defaults on and lives here instead
  // of a global config.
  animations_enabled: boolean;
  // Whether the post-login intro video plays for this account (default on).
  show_intro: boolean;
};

export type PreferencesPatch = Partial<
  Pick<
    AccountProfile,
    | "display_name"
    | "photo_url"
    | "theme"
    | "default_office"
    | "notify_anniversaries"
    | "notify_birthdays"
    | "notify_new_hires"
    | "notify_on_violation_review"
    | "notify_on_new_hire_added"
    | "notify_on_hmo_member_added"
    | "animations_enabled"
    | "show_intro"
  >
>;

// Sends the browser to the backend, which redirects to Zoho and then back to
// this app once sign-in completes. Deliberately a full navigation rather than
// a fetch — Zoho's own login page has to be a top-level page, not an iframe
// or an XHR target.
export function signInWithZoho(): void {
  window.location.href = apiUrl("/auth/zoho/login");
}

// GET /auth/status — which sign-in this deployment uses. "zoho" until the
// backend has GATEWAY_URL set; then the TGO Gateway owns sign-in and `status`
// says where this browser stands (see GatewaySignInStatus in
// backend/app/core/auth.py).
export type GatewaySignInStatus =
  "signed_in" | "signed_out" | "ended" | "denied" | "unavailable" | "inactive" | "invite_only";

export interface SignInStatus {
  mode: "zoho" | "gateway";
  status: GatewaySignInStatus | null;
  detail: string | null;
  login_url: string | null;
  logout_url: string | null;
}

export async function fetchSignInStatus(): Promise<SignInStatus> {
  try {
    const response = await fetch(apiUrl("/auth/status"), { credentials: "include" });
    if (response.ok) return (await response.json()) as SignInStatus;
  } catch {
    // Fall through: an unreachable backend is shown like an unreachable Gateway.
  }
  return {
    mode: "gateway",
    status: "unavailable",
    detail: "TGO Workforce isn't responding. Try again in a minute.",
    login_url: null,
    logout_url: null,
  };
}

export async function fetchCurrentAccount(): Promise<AccountProfile | null> {
  try {
    const response = await fetch(apiUrl("/auth/me"), {
      credentials: "include",
    });
    if (!response.ok) return null;
    return (await response.json()) as AccountProfile | null;
  } catch {
    // Backend unreachable — treat as signed out rather than throwing, so a
    // network hiccup doesn't take down the whole app shell.
    return null;
  }
}

// Shared "who's signed in" query — used by AppShell (auth guard), the
// sidebar (admin-only nav item) and the User Management page (access gate),
// all backed by the same React Query cache so it's one network call, not
// three.
export const CURRENT_ACCOUNT_KEY = ["current-account"] as const;

export function useCurrentAccount() {
  return useQuery({
    queryKey: CURRENT_ACCOUNT_KEY,
    queryFn: fetchCurrentAccount,
    staleTime: 60_000,
  });
}

async function updateMyPreferences(patch: PreferencesPatch): Promise<AccountProfile> {
  const response = await fetch(apiUrl("/auth/me/preferences"), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Couldn't save preferences (${response.status})`);
  }
  return (await response.json()) as AccountProfile;
}

/** Backs the Profile and Settings pages' personalization controls, plus the
 * header ThemeToggle — every write here is "change my own preferences", so
 * it always targets the signed-in account, never one picked by id. */
export function useUpdateMyPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyPreferences,
    onSuccess: (account) => {
      queryClient.setQueryData(CURRENT_ACCOUNT_KEY, account);
    },
  });
}

async function postForAccount(path: string, body?: unknown): Promise<AccountProfile> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request to ${path} failed (${response.status})`);
  }
  return (await response.json()) as AccountProfile;
}

/** Super Admin only — temporarily switches the caller's *effective* role for
 * this session to one of the six matrix-configurable roles. A real,
 * backend-enforced switch (see backend/app/core/auth.py's get_effective_role),
 * not just a UI preview: nav, pages and every write action all start
 * enforcing exactly what that role can do. Directly overwrites the cached
 * account (same pattern as useUpdateMyPreferences) so the whole app re-renders
 * under the new effective role immediately, without waiting on staleTime. */
export function useEnterSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: AccountRole) =>
      withRoleSwitchScreen(queryClient, { kind: "enter", role }, () =>
        postForAccount("/auth/sandbox/enter", { role }),
      ),
    onSuccess: (account) => {
      queryClient.setQueryData(CURRENT_ACCOUNT_KEY, account);
      endRoleSwitch();
    },
    onError: () => endRoleSwitch(true),
  });
}

export function useExitSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      withRoleSwitchScreen(queryClient, { kind: "exit" }, () =>
        postForAccount("/auth/sandbox/exit"),
      ),
    onSuccess: (account) => {
      queryClient.setQueryData(CURRENT_ACCOUNT_KEY, account);
      endRoleSwitch();
    },
    onError: () => endRoleSwitch(true),
  });
}

/** Runs a role switch behind the full-screen loading screen: the overlay goes
 * up first, the request runs under it, and the result isn't returned until the
 * screen has been up for its full intended duration (so it reads as a
 * deliberate transition, not a flash). The caller's onSuccess then swaps the
 * account in — still under the cover — and fades it out. */
async function withRoleSwitchScreen<T>(
  queryClient: QueryClient,
  target: RoleSwitchTarget,
  run: () => Promise<T>,
): Promise<T> {
  const cached = queryClient.getQueryData<AccountProfile>(CURRENT_ACCOUNT_KEY);
  const durationMs =
    (cached?.animations_enabled ?? true) ? ROLE_SWITCH_MIN_MS : ROLE_SWITCH_REDUCED_MS;
  const started = Date.now();
  beginRoleSwitch(target, durationMs);
  const result = await run();
  await wait(Math.max(0, durationMs - (Date.now() - started)));
  return result;
}

/** Ends this app's session. Resolves to the TGO Gateway's logout URL when the
 * Gateway owns sign-in: the caller must go there too, or the still-live
 * Gateway session signs them straight back in on the next request. */
export async function signOut(): Promise<string | null> {
  try {
    await fetch(apiUrl("/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best-effort — the cookie expires on its own even if this call fails.
  }
  const signIn = await fetchSignInStatus();
  return signIn.mode === "gateway" ? signIn.logout_url : null;
}
