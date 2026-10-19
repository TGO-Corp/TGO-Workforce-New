// Nav bell icon + dropdown — the quick peek. The full inbox (search, clear,
// delete, paging) is the Notifications page, /notifications, in the sidebar.
// Polls for an unread count independently of whether the dropdown is open
// (see useUnreadCountQuery), and fetches the actual list on open.

import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Notification } from "@/data/notification-api";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsQuery,
  useUnreadCountQuery,
} from "@/data/notification-store";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { data: unreadCount } = useUnreadCountQuery();
  const { data: notifications } = useNotificationsQuery();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unreadCount ?? 0;
  const items = notifications ?? [];

  function handleOpen(notification: Notification) {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) navigate({ to: notification.link });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs font-normal text-muted-foreground"
              disabled={markAllRead.isPending}
              onClick={(e) => {
                e.stopPropagation();
                markAllRead.mutate();
              }}
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            items.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="flex cursor-pointer flex-col items-start gap-0.5 whitespace-normal py-2"
                onClick={() => handleOpen(notification)}
              >
                <div className="flex w-full items-start gap-1.5">
                  {!notification.isRead && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <p
                    className={
                      notification.isRead ? "text-sm text-muted-foreground" : "text-sm font-medium"
                    }
                  >
                    {notification.title}
                  </p>
                </div>
                {notification.body && (
                  <p className="pl-3 text-xs text-muted-foreground">{notification.body}</p>
                )}
                <p className="pl-3 text-[11px] text-muted-foreground/70">
                  {timeAgo(notification.createdAt)}
                </p>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer justify-center text-sm font-medium"
          onClick={() => navigate({ to: "/notifications" })}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
