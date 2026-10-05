import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ShieldAlert,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { canViewNewHires } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";
import { FilterSelect } from "@/components/filter-select";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePortalNewHires } from "@/data/new-hire-portal-store";
import type { PortalNewHireStatus } from "@/data/new-hire-portal-api";

export const Route = createFileRoute("/new-hires")({
  head: () => ({
    meta: [
      { title: "Onboarding New Hires — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Candidates in the onboarding pipeline, live from the Onboarding/Offboarding portal.",
      },
      {
        property: "og:title",
        content: "Onboarding New Hires — Torero Global Outsourcing HR Operations",
      },
      {
        property: "og:description",
        content: "Track candidates through the onboarding portal's hiring pipeline.",
      },
    ],
  }),
  component: NewHiresPage,
});

const PAGE_SIZE = 8;

const STATUS_LABELS: Record<PortalNewHireStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

function StatusBadge({ status }: { status: PortalNewHireStatus }) {
  if (status === "COMPLETED") return <Badge>Completed</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="secondary">In Progress</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function NewHiresPage() {
  const { data: account, isLoading } = useCurrentAccount();
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Onboarding New Hires"
          description="Candidates in the onboarding pipeline, pulled live from the Onboarding/Offboarding portal."
        />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }
  if (!canViewNewHires(account?.permissions)) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Onboarding New Hires"
          description="Candidates in the onboarding pipeline, pulled live from the Onboarding/Offboarding portal."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No access</p>
              <p className="text-sm text-muted-foreground">
                Your account ({account ? ROLE_LABELS[account.role] : "signed out"}) doesn't have
                access to Onboarding New Hires. Ask a Super Admin to grant it from the permission
                matrix on User Management if you need it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <NewHiresContent />;
}

function NewHiresContent() {
  const { data, isLoading, isError } = usePortalNewHires();
  const hires = useMemo(() => data ?? [], [data]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const statusLabelToValue = useMemo(
    () => new Map(Object.entries(STATUS_LABELS).map(([value, label]) => [label, value])),
    [],
  );
  const statusFilterLabel =
    statusFilter === "all" ? "all" : (STATUS_LABELS[statusFilter as PortalNewHireStatus] ?? "all");

  const departmentOptions = useMemo(
    () => Array.from(new Set(hires.map((h) => h.department).filter(Boolean))).sort(),
    [hires],
  );
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hires.filter((h) => {
      const matchesQuery =
        !q ||
        h.name.toLowerCase().includes(q) ||
        (h.companyId ?? "").toLowerCase().includes(q) ||
        h.email.toLowerCase().includes(q) ||
        h.position.toLowerCase().includes(q) ||
        h.department.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || h.status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || h.department === departmentFilter;
      return matchesQuery && matchesStatus && matchesDepartment;
    });
  }, [hires, query, statusFilter, departmentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = hires.length;
    const pending = hires.filter((h) => h.status === "PENDING").length;
    const inProgress = hires.filter((h) => h.status === "IN_PROGRESS").length;
    const completed = hires.filter((h) => h.status === "COMPLETED").length;
    return { total, pending, inProgress, completed };
  }, [hires]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding New Hires"
        description="Candidates in the onboarding pipeline, pulled live from the Onboarding/Offboarding portal."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total"
          value={stats.total}
          hint="In the portal's pipeline"
          icon={Users}
        />
        <MetricCard title="Pending" value={stats.pending} hint="Not yet started" icon={Circle} />
        <MetricCard
          title="In Progress"
          value={stats.inProgress}
          hint="Currently onboarding"
          icon={TrendingUp}
        />
        <MetricCard
          title="Completed"
          value={stats.completed}
          hint="Finished the portal's process"
          icon={CheckCircle2}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, ID, email or position..."
            className="pl-9"
          />
        </div>
        <FilterSelect
          value={statusFilterLabel}
          onChange={(label) => {
            setStatusFilter(statusLabelToValue.get(label) ?? "all");
            setPage(1);
          }}
          placeholder="Status"
          allLabel="All statuses"
          options={Object.values(STATUS_LABELS)}
        />
        <FilterSelect
          value={departmentFilter}
          onChange={(v) => {
            setDepartmentFilter(v);
            setPage(1);
          }}
          placeholder="Department"
          allLabel="All departments"
          options={departmentOptions}
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Loading new hires from the onboarding portal…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && isError && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Couldn't reach the onboarding portal. Try again shortly.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !isError && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No new hires match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">
                    {h.companyId ?? <span className="italic text-muted-foreground/60">—</span>}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    <div>{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.email}
                      {h.phone ? ` · ${h.phone}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{h.position}</TableCell>
                  <TableCell className="whitespace-nowrap">{h.department}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {new Date(h.startDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {h.manager ?? <span className="italic text-muted-foreground/60">—</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={h.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} of {filtered.length} new hires
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
    </div>
  );
}
