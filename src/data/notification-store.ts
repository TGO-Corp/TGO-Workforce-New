import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  clearNotifications,
  deleteNotification,
  fetchNotificationPage,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  type NotificationPageParams,
} from "@/data/notification-api";

// The nav bell icon and its dropdown read and write through these hooks — a
// React Query cache keyed on "notifications", backed by the FastAPI/Postgres
// API (see backend/app/api/routes/notifications.py). Mirrors
// @/data/employee-store's shape and polling convention.

const NOTIFICATIONS_KEY = ["notifications"] as const;
const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;

// Same "multiple things can change server-side between your own actions"
// rationale as employee-store.ts — someone else's action (e.g. a violation
// getting prepared) can create a notification for you at any time.
const REALTIME_POLL_MS = 15_000;

export function useNotificationsQuery() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => fetchNotifications(),
    refetchInterval: REALTIME_POLL_MS,
  });
}

/** Lightweight poll target for the bell's badge count — separate from the
 * full list query so the dropdown doesn't have to be open for the badge to
 * stay fresh. */
export function useUnreadCountQuery() {
  return useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: fetchUnreadCount,
    refetchInterval: REALTIME_POLL_MS,
  });
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });
}

// --- The Notifications module (sidebar page) ---------------------------------
// Every mutation invalidates NOTIFICATIONS_KEY, which is a prefix of the page
// query below, the bell's list and the unread count — so all three stay in step.

/** One page of the inbox. keepPreviousData keeps the old rows on screen while the
 * next page or filter loads instead of flashing an empty list. */
export function useNotificationPage(params: NotificationPageParams) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "page", params],
    queryFn: () => fetchNotificationPage(params),
    placeholderData: keepPreviousData,
    refetchInterval: REALTIME_POLL_MS,
  });
}

export function useMarkNotificationUnread() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: number) => markNotificationUnread(id),
    onSuccess: invalidate,
  });
}

export function useDeleteNotification() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: number) => deleteNotification(id),
    onSuccess: invalidate,
  });
}

export function useClearNotifications() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (scope: "read" | "all") => clearNotifications(scope),
    onSuccess: invalidate,
  });
}
