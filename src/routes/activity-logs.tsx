import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  ScrollText,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { canViewActivityLogs } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useActivityLogs,
  type ActivityCategory,
  type ActivitySeverity,
} from "@/data/activity-log-store";

const SEVERITY_VARIANT: Record<ActivitySeverity, "secondary" | "outline" | "destructive"> = {
  info: "secondary",
  warning: "outline",
  critical: "destructive",
};

// Friendlier names for the module a log entry belongs to — this IS the
// module (each category maps 1:1 to a module, or to "admin-only" for
// Access/Data/System — see CATEGORY_PERMISSION in
// backend/app/services/permissions.py, which is what actually decides
// whether a given signed-in account sees rows in each of these at all).
const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  Employee: "Employee Directory",
  Onboarding: "Onboarding",
  Attendance: "Attendance",
  Benefits: "HMO Management",
  Access: "Access & Security",
  Data: "Data",
  System: "System",
};

export const Route = createFileRoute("/activity-logs")({
  head: () => ({
    meta: [
      { title: "Activity Logs — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Audit trail of employee record changes, access events, data exports and system jobs in HR Operations.",
      },
      {
        property: "og:title",
        content: "Activity Logs — Torero Global Outsourcing HR Operations",
      },
      {
        property: "og:description",
        content: "Track who changed what across the TGO internal operations portal.",
      },
    ],
  }),
  component: ActivityLogsPage,
});

const PAGE_SIZE = 15;
type ActivityTimeFilter = "all" | "7" | "30" | "90";

function matchesTimeFilter(occurredAt: string, filter: ActivityTimeFilter): boolean {
  if (filter === "all") return true;
  const occurred = new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) return false;
  const days = Number(filter);
  return Date.now() - occurred.getTime() <= days * 86_400_000;
}

function ActivityLogsPage() {
  const { data: account, isLoading } = useCurrentAccount();
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Activity Logs"
          description="Audit trail of record changes, access events, data exports and system jobs."
        />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }
  if (!canViewActivityLogs(account?.permissions)) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Activity Logs"
          description="Audit trail of record changes, access events, data exports and system jobs."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No access</p>
              <p className="text-sm text-muted-foreground">
                Your account ({account ? ROLE_LABELS[account.role] : "signed out"}) doesn't have
                access to Activity Logs. Ask a Super Admin to grant it from the permission matrix on
                User Management if you need it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <ActivityLogsContent />;
}

function ActivityLogsContent() {
  const { data, isLoading, isError } = useActivityLogs();
  const logs = data ?? [];

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<ActivityTimeFilter>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesQuery =
        !q || [log.id, log.actor, log.action, log.target].some((v) => v.toLowerCase().includes(q));
      const matchesCategory = category === "all" || log.category === category;
      const matchesSeverity = severity === "all" || log.severity === severity;
      return (
        matchesQuery &&
        matchesCategory &&
        matchesSeverity &&
        matchesTimeFilter(log.occurredAt, timeFilter)
      );
    });
  }, [logs, query, category, severity, timeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters =
    !!query.trim() || category !== "all" || severity !== "all" || timeFilter !== "all";

  const critical = logs.filter((l) => l.severity === "critical").length;
  const warning = logs.filter((l) => l.severity === "warning").length;
  const info = logs.filter((l) => l.severity === "info").length;

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setSeverity("all");
    setTimeFilter("all");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Logs"
        description="Audit trail of record changes, access events, data exports and system jobs."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Events"
          value={logs.length}
          hint="All recorded events"
          icon={ScrollText}
        />
        <MetricCard
          title="Critical"
          value={critical}
          hint="Needs immediate review"
          icon={AlertCircle}
        />
        <MetricCard
          title="Warning"
          value={warning}
          hint="Worth a second look"
          icon={AlertTriangle}
        />
        <MetricCard title="Info" value={info} hint="Routine activity" icon={Info} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Filter and page through the full audit trail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search actor, action or record..."
                className="pl-8"
              />
            </div>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {(Object.keys(CATEGORY_LABELS) as ActivityCategory[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={severity}
              onValueChange={(v) => {
                setSeverity(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={timeFilter}
              onValueChange={(v) => {
                setTimeFilter(v as ActivityTimeFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={clearFilters} disabled={!hasFilters}>
              Clear
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Log ID</TableHead>
                  <TableHead className="w-[150px]">Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-right">Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Loading activity...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Couldn't load activity logs. Try refreshing the page.
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No activity matches your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">{log.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {log.timestamp}
                      </TableCell>
                      <TableCell className="font-medium">{log.actor}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell className="text-muted-foreground">{log.target}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{CATEGORY_LABELS[log.category]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={SEVERITY_VARIANT[log.severity]} className="capitalize">
                          {log.severity}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {rows.length} of {filtered.length} events
              </p>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
