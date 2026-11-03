// Live activity from the Onboarding & Offboarding Portal on the Dashboard:
// what just happened over there (exit requests, final pay, asset returns, exit
// interviews, new hires) and what is still open. Read from Workforce's own
// database, which its API keeps in step with the portal (see backend
// app/services/portal_sync.py), and re-read every few seconds - new events slide
// in and flash briefly. Shown to holders of portal_activity.view.

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

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalEntity, PortalEvent } from "@/data/portal-activity-api";
import {
  usePortalFeedQuery,
  usePortalSummaryQuery,
  useSyncPortalNow,
} from "@/data/portal-activity-store";
import { ONBOARDING_PORTAL_LABEL, ONBOARDING_PORTAL_URL } from "@/lib/portal";
import { cn } from "@/lib/utils";

const ENTITY: Record<PortalEntity, { label: string; icon: LucideIcon }> = {
  new_hire: { label: "Onboarding", icon: UserPlus },
  exit_request: { label: "Exit request", icon: LogOut },
  final_pay: { label: "Final pay", icon: Wallet },
  asset_return: { label: "Assets", icon: Laptop },
  exit_interview: { label: "Exit interview", icon: MessageSquareText },
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

function Stat({
  label,
  value,
  hint,
  tone,
  loading,
}: {
  label: string;
  value: number | undefined;
  hint: string;
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
    <div className="relative overflow-hidden rounded-lg border bg-card px-3.5 py-3">
      <span className={cn("absolute inset-y-0 left-0 w-1", accent)} aria-hidden="true" />
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-10" />
      ) : (
        <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
          {(value ?? 0).toLocaleString()}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function PortalActivityCard() {
  const feedQuery = usePortalFeedQuery(true);
  const summaryQuery = usePortalSummaryQuery(true);
  const sync = useSyncPortalNow();
  const now = useNow(5_000);

  // Events that arrive while the card is open get a short highlight. The first
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
    <Card
      role="region"
      aria-label="Onboarding and offboarding activity"
      className="overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 bg-sidebar px-5 py-3.5 text-sidebar-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sidebar-primary">
            <DoorOpen className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              {ONBOARDING_PORTAL_LABEL}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-primary">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sidebar-primary opacity-70 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-sidebar-primary" />
                </span>
                Live
              </span>
            </h2>
            <p className="text-xs text-sidebar-foreground/70">
              Transactions as they happen: onboarding, exits, final pay, assets and interviews.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sidebar-foreground/85 hover:bg-white/10 hover:text-white"
            onClick={handleSync}
            disabled={sync.isPending || notConnected === true}
          >
            {sync.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" />
            )}
            Sync now
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 border-white/20 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white"
          >
            <a href={ONBOARDING_PORTAL_URL} target="_blank" rel="noopener noreferrer">
              Open portal <ArrowUpRight className="ml-1 size-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <CardContent className="space-y-4 p-5">
        {notConnected ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              The portal isn't connected yet. An admin needs to set{" "}
              <span className="font-mono text-xs">ONBOARDING_PORTAL_BASE_URL</span> and{" "}
              <span className="font-mono text-xs">ONBOARDING_PORTAL_API_KEY</span> on the backend.
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

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Exit requests pending"
                value={summary?.pendingExitRequests}
                hint="Awaiting a decision"
                tone="amber"
                loading={loading}
              />
              <Stat
                label="Approved exits"
                value={summary?.approvedExitRequests}
                hint="Leaving, not yet completed"
                tone="sky"
                loading={loading}
              />
              <Stat
                label="Final pay open"
                value={summary?.finalPayOpen}
                hint="Pending, processing or on hold"
                tone="violet"
                loading={loading}
              />
              <Stat
                label="Assets outstanding"
                value={summary?.assetsOutstanding}
                hint="Not yet returned"
                tone="rose"
                loading={loading}
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent activity</h3>
                <span className="text-xs text-muted-foreground">
                  {summary ? `${summary.events24h.toLocaleString()} in the last 24 hours` : " "}
                </span>
              </div>
              {feedQuery.isLoading ? (
                <div className="space-y-2 py-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : feedQuery.isError ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Couldn't load portal activity. It will retry automatically.
                </p>
              ) : events.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No activity yet. New transactions from the portal will appear here as they happen.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {events.map((event) => {
                    const meta = ENTITY[event.entity] ?? ENTITY.new_hire;
                    const Icon = meta.icon;
                    const isFresh = fresh.has(event.id);
                    return (
                      <li
                        key={event.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-1000",
                          isFresh &&
                            "animate-in fade-in-0 slide-in-from-top-2 bg-sidebar-primary/20 duration-500 motion-reduce:animate-none",
                        )}
                      >
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{event.title}</p>
                          {event.detail && (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {event.detail}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              statusTone(event.state),
                            )}
                          >
                            {statusLabel(event)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {ago(event.occurredAt, now)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-right text-[11px] text-muted-foreground">
              Last checked {ago(summary?.lastSyncedAt ?? null, now)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
