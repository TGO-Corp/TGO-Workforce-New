// Full-page profile view for a single account (role & access, login
// history, activity logs) — reachable by clicking a row in User
// Management's Accounts table. A real page rather than a dialog, so it's
// linkable/shareable/back-buttonable like everything else in the app.
// Composes entirely from data already fetched elsewhere (no new backend
// endpoints):
//  - Role & Access: usePermissionMatrixQuery's role→permission matrix, looked
//    up for this account's role (Super Admin only — the endpoint 403s anyone
//    else, so it's gated on `isSuperAdmin` instead of firing and failing).
//  - Login History / Activity Logs: useMyActivityLogs(accountId), despite its
//    "my" name it's fully generic (GET /activity-logs?account_id=...) and is
//    split client-side by whether `action` looks like a sign-in event, then
//    filtered/paginated client-side (the store's fetch has no offset/
//    category params exposed yet, and this account's total row count is
//    small enough that fetching one page-sized batch and slicing it in the
//    browser is simpler than plumbing that through).
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  LogIn,
  Lock,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccountsQuery } from "@/data/account-store";
import {
  useMyActivityLogs,
  type ActivityCategory,
  type ActivityLogEntry,
  type ActivitySeverity,
} from "@/data/activity-log-store";
import { usePermissionMatrixQuery } from "@/data/permission-store";
import { getEffectiveRole, isFullAccessRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";

export const Route = createFileRoute("/user-management/$accountId")({
  head: () => ({
    meta: [
      { title: "User Profile — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Role, access, login history and activity for a portal account.",
      },
    ],
  }),
  component: UserProfilePage,
});

const SEVERITY_VARIANT: Record<ActivitySeverity, "secondary" | "outline" | "destructive"> = {
  info: "secondary",
  warning: "outline",
  critical: "destructive",
};

const ALL_CATEGORIES: ActivityCategory[] = [
  "Employee",
  "Access",
  "Data",
  "System",
  "Onboarding",
  "Attendance",
  "Benefits",
];

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

// The backend logs sign-in attempts under category=Access with these action
// prefixes (see backend/app/api/routes/auth.py's record_activity calls) —
// there's no dedicated "login" category, so this is how the Login History
// tab tells those rows apart from everything else in Activity Logs.
function isSignInEvent(action: string) {
  return action.toLowerCase().startsWith("sign");
}

// Same SSR/hydration guard as workforce-charts.tsx's charts — recharts needs
// real layout dimensions to measure against, which don't exist yet on the
// server-rendered pass, so the first client render shows a skeleton instead
// of a zero-size chart that would otherwise flash before resizing.
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const activityTrendConfig = {
  count: { label: "Events", color: "var(--chart-2)" },
} satisfies ChartConfig;

const ACTIVITY_TREND_DAYS = 14;

function activityByDay(logs: ActivityLogEntry[]): { date: string; count: number }[] {
  const now = new Date();
  const buckets = new Map<string, number>();
  for (let i = ACTIVITY_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), 0);
  }
  for (const log of logs) {
    const occurred = new Date(log.occurredAt);
    if (Number.isNaN(occurred.getTime())) continue;
    const daysAgo = Math.floor((now.getTime() - occurred.getTime()) / 86_400_000);
    if (daysAgo < 0 || daysAgo >= ACTIVITY_TREND_DAYS) continue;
    const key = occurred.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

const categoryChartConfig = {
  count: { label: "Events" },
  Employee: { label: "Employee", color: "var(--chart-1)" },
  Access: { label: "Access", color: "var(--chart-2)" },
  Data: { label: "Data", color: "var(--chart-3)" },
  System: { label: "System", color: "var(--chart-4)" },
  Onboarding: { label: "Onboarding", color: "var(--chart-5)" },
  Attendance: { label: "Attendance", color: "var(--chart-1)" },
  Benefits: { label: "Benefits", color: "var(--chart-2)" },
} satisfies ChartConfig;

function activityByCategory(
  logs: ActivityLogEntry[],
): { category: ActivityCategory; count: number }[] {
  return ALL_CATEGORIES.map((category) => ({
    category,
    count: logs.filter((log) => log.category === category).length,
  }));
}

const PAGE_SIZE = 8;

function LogList({
  logs,
  loading,
  emptyText,
  categoryOptions,
  severityOptions,
}: {
  logs: ActivityLogEntry[];
  loading: boolean;
  emptyText: string;
  categoryOptions?: ActivityCategory[];
  severityOptions: { value: ActivitySeverity | "all"; label: string }[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [severity, setSeverity] = useState<ActivitySeverity | "all">("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, category, severity]);

  if (loading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;

  const term = search.trim().toLowerCase();
  const filtered = logs.filter((log) => {
    if (category !== "all" && log.category !== category) return false;
    if (severity !== "all" && log.severity !== severity) return false;
    if (
      term &&
      !log.action.toLowerCase().includes(term) &&
      !log.target.toLowerCase().includes(term)
    ) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action or target…"
          className="sm:max-w-[220px]"
        />
        {categoryOptions && (
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as ActivityCategory | "all")}
          >
            <SelectTrigger className="sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={severity} onValueChange={(v) => setSeverity(v as ActivitySeverity | "all")}>
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {severityOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pageItems.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {logs.length === 0 ? emptyText : "No entries match these filters."}
        </p>
      ) : (
        <div className="space-y-2">
          {pageItems.map((log) => (
            <div
              key={log.id}
              className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{log.action}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {log.target} · {log.timestamp}
                </p>
              </div>
              <Badge variant={SEVERITY_VARIANT[log.severity]} className="w-fit shrink-0 capitalize">
                {log.category}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages} · {filtered.length}{" "}
            {filtered.length === 1 ? "entry" : "entries"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserProfilePage() {
  const { accountId } = Route.useParams();
  const { data: currentAccount, isLoading: currentLoading } = useCurrentAccount();
  const effectiveRole = getEffectiveRole(currentAccount);
  const isAdmin = isFullAccessRole(effectiveRole);
  const isSuperAdmin = effectiveRole === "super_admin";
  const mounted = useMounted();

  const accountsQuery = useAccountsQuery(isAdmin);
  const account = accountsQuery.data?.find((a) => a.id === accountId);

  const matrixQuery = usePermissionMatrixQuery(isSuperAdmin);
  const activityQuery = useMyActivityLogs(account?.id, 200);

  const activity = activityQuery.data ?? [];
  const loginHistory = activity.filter((log) => isSignInEvent(log.action));
  const generalActivity = activity.filter((log) => !isSignInEvent(log.action));
  const successfulLogins = loginHistory.filter((log) => log.severity === "info").length;
  const failedLogins = loginHistory.filter((log) => log.severity !== "info").length;
  const accountAgeDays = account
    ? Math.max(0, Math.floor((Date.now() - new Date(account.createdAt).getTime()) / 86_400_000))
    : 0;
  const trendData = activityByDay(activity);
  const categoryData = activityByCategory(activity);

  const fullAccess = !!account && isFullAccessRole(account.role);
  const roleEntry = matrixQuery.data?.roles.find((r) => r.role === account?.role);

  const backLink = (
    <Link
      to="/user-management"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back to User Management
    </Link>
  );

  if (currentLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Admins only</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accountsQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">Loading account…</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Account not found</p>
            <p className="text-sm text-muted-foreground">
              It may have been removed, or the link is out of date.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName =
    account.displayName ||
    [account.firstName, account.lastName].filter(Boolean).join(" ") ||
    account.email;

  return (
    <div className="space-y-6">
      {backLink}

      <PageHeader
        title="User Profile"
        description="Role, access, login history and activity for this account."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-14 shrink-0">
              {account.photoUrl && <AvatarImage src={account.photoUrl} alt={displayName} />}
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{displayName}</p>
              <p className="truncate text-sm text-muted-foreground">{account.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> {ROLE_LABELS[account.role]}
            </Badge>
            <Badge variant={account.isActive ? "default" : "secondary"}>
              {account.isActive ? "Active" : "Inactive"}
            </Badge>
            {account.isRestricted && (
              <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" /> View-only
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Activity"
          value={activity.length}
          hint="All recorded events"
          icon={Activity}
        />
        <MetricCard
          title="Successful Logins"
          value={successfulLogins}
          hint="Sign-ins that succeeded"
          icon={LogIn}
        />
        <MetricCard
          title="Failed Logins"
          value={failedLogins}
          hint="Rejected or failed attempts"
          icon={XCircle}
        />
        <MetricCard
          title="Account Age"
          value={accountAgeDays}
          hint="Days since first sign-in"
          icon={CalendarDays}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity Over Time</CardTitle>
            <CardDescription>
              Events recorded in the last {ACTIVITY_TREND_DAYS} days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!mounted ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ChartContainer config={activityTrendConfig} className="h-[260px] w-full">
                <BarChart data={trendData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity by Category</CardTitle>
            <CardDescription>Where this account's recorded events fall</CardDescription>
          </CardHeader>
          <CardContent>
            {!mounted ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ChartContainer config={categoryChartConfig} className="h-[260px] w-full">
                <BarChart data={categoryData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="category" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {categoryData.map((entry) => (
                      <Cell key={entry.category} fill={`var(--color-${entry.category})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="access">
            <div className="overflow-x-auto">
              <TabsList>
                <TabsTrigger value="access">Role & Access</TabsTrigger>
                <TabsTrigger value="logins">Login History</TabsTrigger>
                <TabsTrigger value="activity">Activity Logs</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="access" className="space-y-4">
              {fullAccess ? (
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABELS[account.role]} bypasses the permission matrix entirely — full access
                  to every module.
                </p>
              ) : !isSuperAdmin ? (
                <p className="text-sm text-muted-foreground">
                  Detailed permission grants are only visible to Super Admins.
                </p>
              ) : matrixQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading permissions…</p>
              ) : (
                <div className="space-y-1.5">
                  {(matrixQuery.data?.permissions ?? []).map((perm) => {
                    const granted = roleEntry?.permissions.includes(perm.key) ?? false;
                    return (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{perm.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {perm.description}
                          </p>
                        </div>
                        <Badge variant={granted ? "default" : "secondary"} className="shrink-0">
                          {granted ? "Granted" : "Not granted"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="logins">
              <LogList
                logs={loginHistory}
                loading={activityQuery.isLoading}
                emptyText="No sign-in activity recorded yet."
                severityOptions={[
                  { value: "all", label: "All" },
                  { value: "info", label: "Successful" },
                  { value: "warning", label: "Failed" },
                ]}
              />
            </TabsContent>

            <TabsContent value="activity">
              <LogList
                logs={generalActivity}
                loading={activityQuery.isLoading}
                emptyText="Nothing recorded yet."
                categoryOptions={ALL_CATEGORIES}
                severityOptions={[
                  { value: "all", label: "All" },
                  { value: "info", label: "Info" },
                  { value: "warning", label: "Warning" },
                  { value: "critical", label: "Critical" },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
