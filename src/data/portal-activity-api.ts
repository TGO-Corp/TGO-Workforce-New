// HTTP client for /portal-activity (backend/app/api/routes/portal_activity.py):
// the live feed and counts from the Onboarding & Offboarding Portal. Workforce's
// API keeps these up to date by polling the portal; this just reads them.

import { apiUrl } from "@/lib/api";

export type PortalEntity =
  "new_hire" | "exit_request" | "final_pay" | "asset_return" | "exit_interview";

export type PortalEvent = {
  id: number;
  entity: PortalEntity;
  kind: "new" | "update";
  state: string;
  title: string;
  detail: string | null;
  employeeName: string | null;
  occurredAt: string;
};

export type PortalSummary = {
  configured: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  events24h: number;
  pendingExitRequests: number;
  approvedExitRequests: number;
  finalPayOpen: number;
  assetsOutstanding: number;
  newHiresPending: number;
};

type BackendEvent = {
  id: number;
  entity: PortalEntity;
  kind: "new" | "update";
  state: string;
  title: string;
  detail: string | null;
  employee_name: string | null;
  occurred_at: string;
};

type BackendSummary = {
  configured: boolean;
  last_synced_at: string | null;
  error: string | null;
  events_24h: number;
  pending_exit_requests: number;
  approved_exit_requests: number;
  final_pay_open: number;
  assets_outstanding: number;
  new_hires_pending: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Request to ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function summaryFromBackend(row: BackendSummary): PortalSummary {
  return {
    configured: row.configured,
    lastSyncedAt: row.last_synced_at,
    error: row.error,
    events24h: row.events_24h,
    pendingExitRequests: row.pending_exit_requests,
    approvedExitRequests: row.approved_exit_requests,
    finalPayOpen: row.final_pay_open,
    assetsOutstanding: row.assets_outstanding,
    newHiresPending: row.new_hires_pending,
  };
}

export async function fetchPortalFeed(limit: number): Promise<PortalEvent[]> {
  const page = await request<{ items: BackendEvent[]; total: number }>(
    `/portal-activity/feed?limit=${limit}`,
  );
  return page.items.map((row) => ({
    id: row.id,
    entity: row.entity,
    kind: row.kind,
    state: row.state,
    title: row.title,
    detail: row.detail,
    employeeName: row.employee_name,
    occurredAt: row.occurred_at,
  }));
}

export async function fetchPortalSummary(): Promise<PortalSummary> {
  return summaryFromBackend(await request<BackendSummary>("/portal-activity/summary"));
}

export async function syncPortalNow(): Promise<PortalSummary> {
  return summaryFromBackend(
    await request<BackendSummary>("/portal-activity/sync", { method: "POST" }),
  );
}
