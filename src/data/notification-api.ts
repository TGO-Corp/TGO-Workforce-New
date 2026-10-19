// HTTP client for the /notifications endpoints (backend/app/api/routes/notifications.py).
// Mirrors src/data/employee-api.ts's shape exactly. @/data/notification-store
// wraps these in React Query hooks; components should use that, not this
// file, directly.

import { apiUrl } from "@/lib/api";

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

type BackendNotification = {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function fromBackend(row: BackendNotification): Notification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: row.is_read,
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
    throw new Error(`Request to ${path} failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchNotifications(unreadOnly = false): Promise<Notification[]> {
  const params = new URLSearchParams({ limit: "30" });
  if (unreadOnly) params.set("unread_only", "true");
  const rows = await request<BackendNotification[]>(`/notifications?${params.toString()}`);
  return rows.map(fromBackend);
}

export async function fetchUnreadCount(): Promise<number> {
  const data = await request<{ count: number }>("/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(id: number): Promise<Notification> {
  const row = await request<BackendNotification>(`/notifications/${id}/read`, { method: "POST" });
  return fromBackend(row);
}

export async function markAllNotificationsRead(): Promise<void> {
  await request<void>("/notifications/read-all", { method: "POST" });
}

// --- The Notifications module (sidebar page) ---------------------------------
// GET /notifications/page does the search, the unread-only filter and the paging
// in the database; the bell keeps using the plain list above.

export type NotificationPageParams = {
  unreadOnly: boolean;
  query: string;
  page: number;
  pageSize: number;
};

export type NotificationPageResult = {
  items: Notification[];
  /** Notifications matching the filters, across every page. */
  total: number;
  /** The caller's unread notifications overall, ignoring the filters. */
  unread: number;
};

export async function fetchNotificationPage(
  params: NotificationPageParams,
): Promise<NotificationPageResult> {
  const search = new URLSearchParams({
    limit: String(params.pageSize),
    offset: String((params.page - 1) * params.pageSize),
  });
  if (params.unreadOnly) search.set("unread_only", "true");
  if (params.query.trim()) search.set("q", params.query.trim());
  const body = await request<{ items: BackendNotification[]; total: number; unread: number }>(
    `/notifications/page?${search.toString()}`,
  );
  return { items: body.items.map(fromBackend), total: body.total, unread: body.unread };
}

export async function markNotificationUnread(id: number): Promise<Notification> {
  const row = await request<BackendNotification>(`/notifications/${id}/unread`, { method: "POST" });
  return fromBackend(row);
}

export async function deleteNotification(id: number): Promise<void> {
  await request<void>(`/notifications/${id}`, { method: "DELETE" });
}

/** Clears the signed-in account's inbox: only the already-read ones, or all of
 * them. Resolves to how many were removed. */
export async function clearNotifications(scope: "read" | "all"): Promise<number> {
  const body = await request<{ deleted: number }>(`/notifications?scope=${scope}`, {
    method: "DELETE",
  });
  return body.deleted;
}
