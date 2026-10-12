// HTTP client for the /accounts endpoints (backend/app/api/routes/accounts.py)
// — admin-only user management: list every account that has ever signed in,
// and change its role or active state. Mirrors @/data/employee-api.ts:
// snake_case<->camelCase mapping in one place, React Query hooks live in
// @/data/account-store.

import { apiUrl } from "@/lib/api";
import type { AccountRole } from "@/lib/session";

export type Account = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  photoUrl: string | null;
  role: AccountRole;
  isActive: boolean;
  isRestricted: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type BackendAccount = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  role: AccountRole;
  is_active: boolean;
  is_restricted: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

function fromBackend(row: BackendAccount): Account {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    role: row.role,
    isActive: row.is_active,
    isRestricted: row.is_restricted,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, path));
  }
  // revokePendingInvite's DELETE returns 204 with no body — parsing that as
  // JSON would throw, since there's nothing there to parse.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** FastAPI error responses are JSON — `{"detail": "message"}` for a plain
 * HTTPException, or a Pydantic validation-error array for a 422. Surface the
 * human-readable message either way instead of a raw JSON blob in a toast. */
async function readErrorMessage(response: Response, path: string): Promise<string> {
  const fallback = `Request to ${path} failed (${response.status})`;
  const body = await response.text();
  if (!body) return fallback;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      const messages = parsed.detail
        .map((item) =>
          item && typeof item === "object" && "msg" in item ? String(item.msg) : null,
        )
        .filter((msg): msg is string => Boolean(msg));
      if (messages.length > 0) return messages.join("; ");
    }
    return fallback;
  } catch {
    return body;
  }
}

export async function fetchAccounts(): Promise<Account[]> {
  const rows = await request<BackendAccount[]>("/accounts");
  return rows.map(fromBackend);
}

export type AccountPatch = { role?: AccountRole; isActive?: boolean; isRestricted?: boolean };

export async function updateAccount(id: string, patch: AccountPatch): Promise<Account> {
  const payload: Record<string, unknown> = {};
  if (patch.role !== undefined) payload["role"] = patch.role;
  if (patch.isActive !== undefined) payload["is_active"] = patch.isActive;
  if (patch.isRestricted !== undefined) payload["is_restricted"] = patch.isRestricted;
  const row = await request<BackendAccount>(`/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return fromBackend(row);
}

/** Removes an account from Workforce (DELETE /accounts/{id}). Their history
 * stays; they can sign in again through the Gateway as a new Viewer. */
export async function deleteAccount(id: string): Promise<void> {
  await request<void>(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- Pending invites ---------------------------------------------------------
// Lets an admin pre-assign a role to an email that hasn't signed in yet — the
// next Zoho sign-in matching that email gets it automatically instead of the
// usual "everyone starts as viewer" default. Nothing here sends an email or
// any other notification (the app has no outbound-mail integration) — the
// admin still has to tell that person out-of-band to go sign in.

export type PendingInvite = {
  id: string;
  email: string;
  role: AccountRole;
  invitedByLabel: string;
  createdAt: string;
};

type BackendPendingInvite = {
  id: string;
  email: string;
  role: AccountRole;
  invited_by_label: string;
  created_at: string;
};

function inviteFromBackend(row: BackendPendingInvite): PendingInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedByLabel: row.invited_by_label,
    createdAt: row.created_at,
  };
}

export async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const rows = await request<BackendPendingInvite[]>("/accounts/invites");
  return rows.map(inviteFromBackend);
}

export async function createPendingInvite(
  email: string,
  role: AccountRole,
): Promise<PendingInvite> {
  const row = await request<BackendPendingInvite>("/accounts/invites", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return inviteFromBackend(row);
}

export async function revokePendingInvite(id: string): Promise<void> {
  await request<void>(`/accounts/invites/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
