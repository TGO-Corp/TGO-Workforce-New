import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Mail,
  MailOpen,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notification } from "@/data/notification-api";
import {
  useClearNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useNotificationPage,
} from "@/data/notification-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Your notification inbox: read, search and clear what the portal has told you.",
      },
    ],
  }),
  component: NotificationsPage,
});

const PAGE_SIZE = 15;
type Filter = "all" | "unread";
type ClearScope = "read" | "all";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [queryInput, setQueryInput] = useState(""); // what's typed
  const [query, setQuery] = useState(""); // what's sent, once typing pauses
  const [page, setPage] = useState(1);
  const [confirmScope, setConfirmScope] = useState<ClearScope | null>(null);

  // Wait for a pause in typing before searching, so each keystroke isn't a request.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const { data, isLoading, isError, isPlaceholderData, refetch } = useNotificationPage({
    unreadOnly: filter === "unread",
    query,
    page,
    pageSize: PAGE_SIZE,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unread = data?.unread ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clearing or reading can shrink the list under you: step back onto a real page.
  useEffect(() => {
    if (!isPlaceholderData && page > pageCount) setPage(pageCount);
  }, [page, pageCount, isPlaceholderData]);
  const currentPage = Math.min(page, pageCount);
  const firstShown = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = firstShown === 0 ? 0 : firstShown + items.length - 1;

  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const deleteOne = useDeleteNotification();
  const markAll = useMarkAllNotificationsRead();
  const clear = useClearNotifications();

  function open(notification: Notification) {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) navigate({ to: notification.link });
  }

  function remove(notification: Notification) {
    deleteOne.mutate(notification.id, {
      onSuccess: () => toast.success("Notification removed"),
      onError: () => toast.error("Couldn't remove that notification."),
    });
  }

  function markAllAsRead() {
    markAll.mutate(undefined, {
      onSuccess: () => toast.success("All notifications marked as read"),
      onError: () => toast.error("Couldn't mark them as read."),
    });
  }

  function confirmClear() {
    if (!confirmScope) return;
    clear.mutate(confirmScope, {
      onSuccess: (deleted) => {
        toast.success(
          deleted === 0
            ? "Nothing to clear"
            : `Cleared ${deleted} notification${deleted === 1 ? "" : "s"}`,
        );
        setConfirmScope(null);
        setPage(1);
      },
      onError: () => toast.error("Couldn't clear your notifications."),
    });
  }

  const filtering = filter === "unread" || query.trim() !== "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Everything the portal has told you. Read, search, and clear it from here."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={unread === 0 || markAll.isPending}
              onClick={markAllAsRead}
            >
              <CheckCheck className="mr-2 h-4 w-4" /> Mark all as read
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eraser className="mr-2 h-4 w-4" /> Clear
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setConfirmScope("read")}>
                  Clear read notifications
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmScope("all")}
                >
                  Clear all notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="group"
          aria-label="Show"
        >
          {(["all", "unread"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "default" : "ghost"}
              className="h-8 px-3"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
            >
              {value === "all" ? "All" : `Unread${unread > 0 ? ` (${unread})` : ""}`}
            </Button>
          ))}
        </div>
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search notifications..."
            aria-label="Search notifications"
            className="pl-8"
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </span>
      </div>

      <Card className={cn("overflow-hidden transition-opacity", isPlaceholderData && "opacity-60")}>
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">Couldn't load your notifications.</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {filtering ? "Nothing matches" : "You have no notifications"}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {query.trim() !== ""
                ? "Try a different search, or clear the filter."
                : filter === "unread"
                  ? "You've read everything."
                  : "New activity that needs your attention will show up here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                  !notification.isRead && "bg-primary/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-2 h-2 w-2 shrink-0 rounded-full",
                    notification.isRead ? "bg-transparent" : "bg-primary",
                  )}
                  aria-label={notification.isRead ? "Read" : "Unread"}
                />
                <button
                  type="button"
                  onClick={() => open(notification)}
                  className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p
                    className={cn(
                      "text-sm",
                      notification.isRead ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {notification.title}
                  </p>
                  {notification.body && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                  )}
                  <p
                    className="mt-1 text-xs text-muted-foreground/80"
                    title={fullDate(notification.createdAt)}
                  >
                    {timeAgo(notification.createdAt)}
                    {notification.link ? " · opens the related page" : ""}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:focus-within:opacity-100 sm:group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={notification.isRead ? "Mark as unread" : "Mark as read"}
                    aria-label={notification.isRead ? "Mark as unread" : "Mark as read"}
                    onClick={() =>
                      notification.isRead
                        ? markUnread.mutate(notification.id)
                        : markRead.mutate(notification.id)
                    }
                  >
                    {notification.isRead ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <MailOpen className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Remove"
                    aria-label="Remove notification"
                    disabled={deleteOne.isPending}
                    onClick={() => remove(notification)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Showing {firstShown}–{lastShown} of {total} notification{total === 1 ? "" : "s"}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <AlertDialog
        open={confirmScope !== null}
        onOpenChange={(open) => {
          if (!open && !clear.isPending) setConfirmScope(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmScope === "all" ? "Clear all notifications?" : "Clear read notifications?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmScope === "all"
                ? "This permanently removes every notification in your inbox, including unread ones."
                : "This permanently removes the notifications you've already read. Unread ones stay."}{" "}
              It only affects your own inbox, and the Activity Logs aren't touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clear.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clear.isPending}
              onClick={(event) => {
                // Keep the dialog open until the request finishes.
                event.preventDefault();
                confirmClear();
              }}
            >
              {clear.isPending ? "Clearing..." : "Clear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
