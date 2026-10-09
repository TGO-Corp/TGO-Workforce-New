// "Who's active now" — Super Admin only, shared by the Dashboard and User
// Management (see src/routes/index.tsx and user-management.tsx). Self-gated:
// renders nothing for anyone who isn't Super Admin, so both call sites can
// just drop this in without their own check.

import { useState } from "react";
import {
  AlertTriangle,
  Compass,
  Loader2,
  MapPin,
  Monitor,
  Radio,
  ShieldOff,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NAV_ITEMS } from "@/components/app-sidebar";
import type { AccountPresence } from "@/data/session-api";
import { useAccountPresenceQuery, useTerminateSession } from "@/data/session-store";
import { getEffectiveRole, isSuperAdminRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";

/** "5 minutes ago" / "3 hours ago" / "2 days ago" — coarse on purpose, this
 * is a presence indicator, not a precise audit timestamp (formatDate/the
 * Activity Logs page already cover exact times). */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatusBadge({ item }: { item: AccountPresence }) {
  if (item.status === "never") {
    return <Badge variant="secondary">Never active</Badge>;
  }
  if (item.status === "active_now") {
    return (
      <Badge
        className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        variant="outline"
      >
        <Radio className="h-3 w-3" />
        Active now
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Active {item.lastSeenAt ? timeAgo(item.lastSeenAt) : "a while ago"}
    </Badge>
  );
}

/** "In HMO Management" while they're active right now, "Last in Employee
 * Directory" once they're not — the module comes from what their browser last
 * reported, so it survives them leaving the page or signing out. */
// Each module's icon is the one its sidebar entry uses, so the Module column
// reads the same as the navigation. The labels are the ones the backend reports
// (module_for_path in backend/app/services/session_info.py) — they match the
// sidebar titles, plus "My Profile" which has no sidebar entry. Anything
// unrecognised falls back to a compass.
const MODULE_ICONS: Map<string, LucideIcon> = new Map([
  ...NAV_ITEMS.map((item): [string, LucideIcon] => [item.title, item.icon]),
  ["My Profile", UserRound],
]);

function ModuleCell({ item }: { item: AccountPresence }) {
  if (!item.currentModule) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const live = item.status === "active_now";
  const Icon = MODULE_ICONS.get(item.currentModule) ?? Compass;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* A small tile around the module icon: green while they're there right
          now, muted once it's just where they last were. */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          live
            ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm">
          <span className="text-muted-foreground">{live ? "In " : "Last in "}</span>
          <span className="font-medium">{item.currentModule}</span>
        </p>
        {item.moduleChangedAt && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {live ? "since " : ""}
            {timeAgo(item.moduleChangedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

/** "Live" badge: a pulsing dot (still when animations are off) that flickers
 * brighter for a moment each time fresh data lands, so you can see it's
 * really updating. */
function LiveIndicator({ fetching }: { fetching: boolean }) {
  const { data: account } = useCurrentAccount();
  const animate = account?.animations_enabled ?? true;
  return (
    <span className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <span className="relative flex h-2 w-2">
        {animate && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full bg-emerald-500 transition-opacity duration-300 ${fetching ? "opacity-60" : "opacity-100"}`}
        />
      </span>
      Live
    </span>
  );
}

export function ActiveSessionsPanel() {
  const { data: account } = useCurrentAccount();
  const isSuperAdmin = isSuperAdminRole(getEffectiveRole(account));
  const { data, isLoading, isError, isFetching } = useAccountPresenceQuery(isSuperAdmin);
  const terminateMutation = useTerminateSession();
  const [terminating, setTerminating] = useState<AccountPresence | null>(null);

  if (!isSuperAdmin) return null;

  const items = data ?? [];
  const activeNowCount = items.filter((i) => i.status === "active_now").length;

  async function confirmTerminate() {
    if (!terminating?.sessionId) return;
    try {
      await terminateMutation.mutateAsync(terminating.sessionId);
      toast.success(`Signed out ${terminating.name}`);
      setTerminating(null);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Couldn't end that session. Please try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          Active Sessions
          <LiveIndicator fetching={isFetching} />
        </CardTitle>
        <CardDescription>
          {activeNowCount} active right now · updates every few seconds · Super Admin only —
          location and device are approximate (from IP address and browser).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Location / IP</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Couldn't load active sessions. Try refreshing the page.
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No accounts yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.accountId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-xs">{initials(item.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {ROLE_LABELS[item.role]}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge item={item} />
                    </TableCell>
                    <TableCell>
                      <ModuleCell item={item} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.locationLabel || item.ipAddress ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.locationLabel ?? item.ipAddress}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.deviceLabel ? (
                        <div className="flex items-center gap-1">
                          <Monitor className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.deviceLabel}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.sessionId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setTerminating(item)}
                        >
                          <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Terminate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AlertDialog open={!!terminating} onOpenChange={(open) => !open && setTerminating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>End {terminating?.name}'s session?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs them out immediately on their next action — they'll need to sign in again
              to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmTerminate();
              }}
              disabled={terminateMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {terminateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Terminate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
