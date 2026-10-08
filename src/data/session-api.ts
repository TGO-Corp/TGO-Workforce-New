// HTTP client for GET /accounts/sessions and POST /accounts/sessions/{id}/terminate
// (backend/app/api/routes/accounts.py) — Super Admin only. Powers the
// "active sessions" panel shared by the Dashboard and User Management (see
// @/components/active-sessions-panel).

import { apiUrl } from "@/lib/api";
import type { AccountRole } from "@/lib/session";

export type PresenceStatus = "active_now" | "active_ago" | "never";

export type AccountPresence = {
  accountId: string;
  name: string;
  email: string;
  role: AccountRole;
  // Present only when there's a live (non-revoked) session to terminate.
  sessionId: string | null;
  status: PresenceStatus;
  lastSeenAt: string | null;
  ipAddress: string | null;
  locationLabel: string | null;
  deviceLabel: string | null;
  // The module the latest session was last reported in (e.g. "HMO
  // Management") and when they got there — "In ..." while active now, "Last
  // in ..." otherwise.
  currentModule: string | null;
  moduleChangedAt: string | null;
};

type BackendPresence = {
  account_id: string;
  name: string;
  email: string;
  role: AccountRole;
  session_id: string | null;
  status: PresenceStatus;
  last_seen_at: string | null;
  ip_address: string | null;
  location_label: string | null;
  device_label: string | null;
  current_module: string | null;
  module_changed_at: string | null;
};

function fromBackend(row: BackendPresence): AccountPresence {
  return {
    accountId: row.account_id,
    name: row.name,
    email: row.email,
    role: row.role,
    sessionId: row.session_id,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    ipAddress: row.ip_address,
    locationLabel: row.location_label,
    deviceLabel: row.device_label,
    currentModule: row.current_module,
    moduleChangedAt: row.module_changed_at,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request to ${path} failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchAccountPresence(): Promise<AccountPresence[]> {
  const rows = await request<BackendPresence[]>("/accounts/sessions");
  return rows.map(fromBackend);
}

export async function terminateSession(sessionId: string): Promise<void> {
  await request<void>(`/accounts/sessions/${encodeURIComponent(sessionId)}/terminate`, {
    method: "POST",
  });
}

/** Tells the backend which page this browser just opened, so the Super Admin's
 * Active Sessions panel can show which module each person is in. Fire-and-
 * forget: presence is a nicety, so a failure is never surfaced. */
export async function reportPresence(path: string): Promise<void> {
  try {
    await fetch(apiUrl("/auth/me/presence"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    });
  } catch {
    // ignore
  }
}
