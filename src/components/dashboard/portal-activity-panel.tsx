// Live activity from the Onboarding & Offboarding Portal, shown inside the
// Dashboard's "Needs attention" card: what is still open over there (exit
// requests, final pay, assets) and the latest transactions as they happen. Read
// from Workforce's own database, which its API keeps in step with the portal
// (see backend app/services/portal_sync.py), and re-read every few seconds - new
// events slide in and flash briefly. Shown to holders of portal_activity.view.

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  DoorOpen,
  Laptop,
  Loader2,
  LogOut,
  MessageSquareText,
  RefreshCw,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import type { PortalEntity, PortalEvent } from "@/data/portal-activity-api";
import {
  usePortalFeedQuery,
  usePortalSummaryQuery,
  useSyncPortalNow,
} from "@/data/portal-activity-store";
import { ONBOARDING_PORTAL_LABEL, ONBOARDING_PORTAL_URL } from "@/lib/portal";
import { cn } from "@/lib/utils";

const FEED_SIZE = 6;

const ENTITY_ICON: Record<PortalEntity, LucideIcon> = {
  new_hire: UserPlus,
  exit_request: LogOut,
  final_pay: Wallet,
  asset_return: Laptop,
  exit_interview: MessageSquareText,
};

// Status -> tone of the pill. Unknown statuses fall back to neutral, since the
// portal may add statuses later.
const GOOD = new Set(["APPROVED", "COMPLETED", "RELEASED", "RETURNED", "ACTIVE", "recorded"]);
const BAD = new Set(["REJECTED", "ON_HOLD", "LOST", "DAMAGED"]);
const WAITING = new Set(["PENDING", "PROCESSING", "ISSUED", "IN_PROGRESS"]);

function statusTone(state: string): string {
  if (BAD.has(state)) return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (GOOD.has(state)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (WAITING.has(state)) return "bg-amber-500/12 text-amber-800 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

function statusLabel(event: PortalEvent): string {
  if (event.state === "recorded") return "Done";
  return event.state
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function Count({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number | undefined;
  tone: "amber" | "sky" | "violet" | "rose";
  loading: boolean;
}) {
  const accent = {
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-lg border px-3 py-2 pl-4">
      <span className={cn("absolute inset-y-0 left-0 w-1", accent)} aria-hidden="true" />
      {loading ? (
        <Skeleton className="h-6 w-8" />
      ) : (
        <p className="text-xl font-semibold leading-none tabular-nums">
          {(value ?? 0).toLocaleString()}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

export function PortalActivityPanel() {
  const feedQuery = usePortalFeedQuery(true, FEED_SIZE);
  const summaryQuery = usePortalSummaryQuery(true);
  const sync = useSyncPortalNow();
  const now = useNow(5_000);

  // Events that arrive while the panel is open get a short highlight. The first
  // load is the baseline, so nothing flashes on page open.
  const known = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const events = feedQuery.data ?? [];
  useEffect(() => {
    if (!feedQuery.data) return;
    const ids = new Set(feedQuery.data.map((event) => event.id));
    if (known.current === null) {
      known.current = ids;
      return;
    }
    const arrived = [...ids].filter((id) => !known.current!.has(id));
    known.current = new Set([...known.current, ...ids]);
    if (arrived.length === 0) return;
    setFresh((current) => new Set([...current, ...arrived]));
    const timer = setTimeout(() => {
      setFresh((current) => {
        const next = new Set(current);
        arrived.forEach((id) => next.delete(id));
        return next;
      });
    }, 8_000);
    return () => clearTimeout(timer);
  }, [feedQuery.data]);

  const summary = summaryQuery.data;
  const loading = summaryQuery.isLoading;
  const notConnected = summary && !summary.configured;
  const problem = summary?.configured ? summary.error : null;

  async function handleSync() {
    try {
      await sync.mutateAsync();
      toast.success("Checked the portal for new activity.");
    } catch {
      toast.error("Couldn't reach the portal. Try again in a moment.");
    }
  }

  return (
    <section aria-label="Onboarding and offboarding activity" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar text-sidebar-primary">
            <DoorOpen className="size-3.5" aria-hidden="true" />
          </span>
          <span className="truncate">{ONBOARDING_PORTAL_LABEL}</span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </h3>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={handleSync}
            disabled={sync.isPending || notConnected === true}
            title="Check the portal now"
            aria-label="Check the portal now"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {sync.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
          <a
            href={ONBOARDING_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the portal (new tab)"
            aria-label="Open the portal (new tab)"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </div>

      {notConnected ? (
        <div className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            The portal isn't connected yet. An admin needs to set{" "}
            <span className="font-mono">ONBOARDING_PORTAL_BASE_URL</span> and{" "}
            <span className="font-mono">ONBOARDING_PORTAL_API_KEY</span> on the backend.
          </p>
        </div>
      ) : (
        <>
          {problem && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <p>{problem}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Count
              label="Exits pending"
              value={summary?.pendingExitRequests}
              tone="amber"
              loading={loading}
            />
            <Count
              label="Approved exits"
              value={summary?.approvedExitRequests}
              tone="sky"
              loading={loading}
            />
            <Count
              label="Final pay open"
              value={summary?.finalPayOpen}
              tone="violet"
              loading={loading}
            />
            <Count
              label="Assets out"
              value={summary?.assetsOutstanding}
              tone="rose"
              loading={loading}
            />
          </div>

          {feedQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : feedQuery.isError ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Couldn't load portal activity. It will retry automatically.
            </p>
          ) : events.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No activity yet. New transactions from the portal appear here as they happen.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {events.map((event) => {
                const Icon = ENTITY_ICON[event.entity] ?? UserPlus;
                const isFresh = fresh.has(event.id);
                return (
                  <li
                    key={event.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md px-1.5 py-2 transition-colors duration-1000",
                      isFresh &&
                        "animate-in fade-in-0 slide-in-from-top-2 bg-sidebar-primary/20 duration-500 motion-reduce:animate-none",
                    )}
                  >
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug">{event.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {event.detail ? `${event.detail} · ` : ""}
                        {ago(event.occurredAt, now)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        statusTone(event.state),
                      )}
                    >
                      {statusLabel(event)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-right text-[11px] text-muted-foreground">
            Last checked {ago(summary?.lastSyncedAt ?? null, now)}
          </p>
        </>
      )}
    </section>
  );
}
