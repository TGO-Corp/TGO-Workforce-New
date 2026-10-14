// Full-page profile view for a single employee (employment details, work
// anniversary, recognition & awards) — reachable by clicking a name in the
// Employee Directory table, or via its hover-card preview
// (@/components/employee-hover-card) or the header search. A real page
// rather than a dialog, same reasoning as user-management.$accountId.tsx:
// linkable/shareable/back-buttonable.
//
// Composes entirely from data already fetched elsewhere (no new backend
// endpoints) — useEmployees() for the record itself, useAwards() filtered to
// this employee's id for Recognition & Awards. The Work Anniversary and
// Recognition & Awards sections each additionally require their own module
// permission (milestones.view / awards.view) on top of the page's base
// employees.view gate, same combined-permission pattern the Anniversaries/
// Birthdays/Awards nav items already use — someone who can see the
// Directory but not Milestones or Awards shouldn't see that data just
// because it's embedded here.
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Award,
  Briefcase,
  CalendarClock,
  ShieldAlert,
  Star,
  Trophy,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAwards } from "@/data/award-store";
import { useEmployeesQuery } from "@/data/employee-store";
import {
  daysUntilNextOccurrence,
  formatDate,
  formatYears,
  isInTraining,
  parseCalendarDate,
  tenure,
  tenureDays,
  type EmployeeStatus,
} from "@/data/employees";
import { canViewAwards, canViewEmployees, canViewMilestones } from "@/lib/permissions";
import { useCurrentAccount } from "@/lib/session";

export const Route = createFileRoute("/directory/$employeeId")({
  head: () => ({
    meta: [
      { title: "Employee Profile — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Employment details, tenure and recognition for a TGO employee.",
      },
    ],
  }),
  component: EmployeeProfilePage,
});

const STATUS_VARIANT: Record<EmployeeStatus, "default" | "secondary" | "destructive"> = {
  Active: "default",
  Resigned: "secondary",
  Terminated: "destructive",
};

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

const backLink = (
  <Link
    to="/directory"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft className="h-4 w-4" /> Back to Employee Directory
  </Link>
);

function EmployeeProfilePage() {
  const { employeeId } = Route.useParams();
  const { data: account, isLoading: accountLoading } = useCurrentAccount();
  const canView = canViewEmployees(account?.permissions);
  const canSeeMilestones = canViewMilestones(account?.permissions);
  const canSeeAwards = canViewAwards(account?.permissions);

  const { data: employeesData, isLoading: employeesLoading } = useEmployeesQuery();
  const employee = employeesData?.find((e) => e.id === employeeId);
  const awards = useAwards(canView && canSeeAwards);
  const employeeAwards = employee ? awards.filter((a) => a.employeeId === employee.id) : [];

  const [showAllAwards, setShowAllAwards] = useState(false);

  if (accountLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No access</p>
              <p className="text-sm text-muted-foreground">
                Your account doesn't have access to the Employee Directory.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (employeesLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-sm text-muted-foreground">Loading employee…</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Employee not found</p>
            <p className="text-sm text-muted-foreground">
              They may have been removed, or the link is out of date.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const training = isInTraining(employee);
  const start = parseCalendarDate(employee.startDate);
  const anniversaryYears = Math.max(0, new Date().getFullYear() - start.getFullYear());
  const daysToAnniversary = daysUntilNextOccurrence(start.getMonth(), start.getDate());
  const anniversaryMonthDay = start.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const visibleAwards = showAllAwards ? employeeAwards : employeeAwards.slice(0, 5);

  return (
    <div className="space-y-6">
      {backLink}

      <PageHeader
        title="Employee Profile"
        description="Employment details, tenure and recognition for this employee."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-16 shrink-0">
              <AvatarFallback className="text-lg">{initials(employee.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{employee.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {employee.position || "—"} · {employee.department}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">{employee.id}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {training ? (
              <Badge
                variant="outline"
                className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400"
              >
                Training
              </Badge>
            ) : (
              <Badge variant={STATUS_VARIANT[employee.status]}>{employee.status}</Badge>
            )}
            <Badge variant="outline">{employee.office}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Tenure"
          value={tenure(employee.startDate, employee.exitDate)}
          hint={`${tenureDays(employee.startDate, employee.exitDate)} days`}
          icon={CalendarClock}
        />
        <MetricCard title="Level" value={employee.level || "—"} hint="Career level" icon={Star} />
        {canSeeAwards && (
          <MetricCard
            title="Recognitions"
            value={employeeAwards.length}
            hint="All-time awards"
            icon={Trophy}
          />
        )}
        {canSeeMilestones && (
          <MetricCard
            title="Next Anniversary"
            value={`${daysToAnniversary}d`}
            hint={anniversaryMonthDay}
            icon={Award}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {(
              [
                { label: "Employee ID", value: employee.id },
                { label: "Office", value: employee.office },
                { label: "Department", value: employee.department },
                { label: "Position", value: employee.position || "—" },
                { label: "Level", value: employee.level || "—" },
                { label: "Source", value: employee.sourceType || "—" },
                { label: "Job Offer Date", value: formatDate(employee.jobOfferDate) },
                { label: "Start Date", value: formatDate(employee.startDate) },
                { label: "Birthday", value: formatDate(employee.birthday) },
                { label: "Exit Date", value: formatDate(employee.exitDate) },
              ] satisfies { label: string; value: string }[]
            ).map((row) => (
              <div key={row.label}>
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="truncate text-sm font-medium">{row.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {canSeeMilestones && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                Work Anniversary
              </CardTitle>
              <CardDescription>Recognition planning for this employee</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="text-sm font-medium">{formatDate(employee.startDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Years of service</p>
                <p className="text-sm font-medium">{formatYears(anniversaryYears)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next anniversary</p>
                <p className="text-sm font-medium">
                  {anniversaryMonthDay}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({daysToAnniversary === 0 ? "today" : `in ${daysToAnniversary}d`})
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {canSeeAwards && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              Recognition & Awards
            </CardTitle>
            <CardDescription>Every award this employee has received</CardDescription>
          </CardHeader>
          <CardContent>
            {employeeAwards.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No awards yet.</p>
            ) : (
              <div className="space-y-2">
                {visibleAwards.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.description && (
                        <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p>{formatDate(a.awardedDate)}</p>
                      <p>By {a.awardedByLabel}</p>
                    </div>
                  </div>
                ))}
                {employeeAwards.length > visibleAwards.length && (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary underline underline-offset-2"
                    onClick={() => setShowAllAwards(true)}
                  >
                    Show all {employeeAwards.length} awards
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
