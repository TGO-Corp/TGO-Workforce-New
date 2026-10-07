import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  UserPlus,
  LogOut,
  Building2,
  Globe2,
  ArrowRight,
  Award,
  Cake,
  ClipboardCheck,
  HeartPulse,
  ShieldAlert,
  Trophy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { BandedCardHeader } from "@/components/banded-card-header";
import { EmployeeNameLink } from "@/components/employee-name-link";
import { ImportEmployeesDialog } from "@/components/import-employees-dialog";
import { HubUtilisationCard } from "@/components/hub-utilisation-card";
import { MetricCard } from "@/components/metric-card";
import { SnapshotCard } from "@/components/snapshot-card";
import { WelcomeBanner } from "@/components/welcome-banner";
import { MyOverview } from "@/components/my-overview";
import { MetricDetailModal } from "@/components/metric-detail-modal";
import { HeadcountTrendChart } from "@/components/workforce-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useAwards } from "@/data/award-store";
import { useEmployees } from "@/data/employee-store";
import {
  anniversaries,
  daysSinceLastOccurrence,
  daysUntilNextOccurrence,
  formatDate,
  formatYears,
  MILESTONE_TIME_FILTER_LABELS,
  metrics,
  officeDistribution,
  parseCalendarDate,
  tenureDays,
  upcomingBirthdays,
} from "@/data/employees";
import { computeStatus } from "@/data/new-hire-api";
import { useNewHires } from "@/data/new-hire-store";
import { useViolationsQuery } from "@/data/violation-store";
import {
  exportAnalyticsPdf,
  exportAnalyticsXlsx,
  type AnalyticsExportData,
} from "@/lib/analytics-export";
import { useCurrentAccount } from "@/lib/session";
import {
  canManageEmployees,
  canViewAttendance,
  canViewAwards,
  canViewBenefits,
  canViewEmployees,
  canViewMilestones,
  canViewOnboarding,
  getEffectiveRole,
  isFullAccessRole,
} from "@/lib/permissions";
import { useHmoMembersQuery } from "@/data/hmo-store";

const RECENT_MILESTONE_DAYS = 30;
const RECENT_HIRE_DAYS = 14;
type DashboardMilestoneWindow = "next-30" | "last-30";
const DASHBOARD_MILESTONE_WINDOWS: DashboardMilestoneWindow[] = ["next-30", "last-30"];
// Rows within this many days get a highlighted background in the detailed
// tables below — "just happened", worth the eye going there first.
const SOON_THRESHOLD_DAYS = 3;

const EXIT_STATUS_VARIANT: Record<string, "secondary" | "destructive"> = {
  Resigned: "secondary",
  Terminated: "destructive",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Operational snapshot across every HR Operations module: headcount, onboarding progress, attendance violations and hub distribution.",
      },
      { property: "og:title", content: "Dashboard — Torero Global Outsourcing HR Operations" },
      {
        property: "og:description",
        content: "Live workforce metrics for TGO automation and AI operations teams.",
      },
    ],
  }),
  component: Dashboard,
});

// A Viewer gets their own personal overview (see MyOverview) rather than any
// of the company-wide / module-snapshot content below. Split into a wrapper
// so CompanyDashboard's many hooks never run conditionally.
function Dashboard() {
  const { data: account } = useCurrentAccount();
  return (
    <div className="space-y-6">
      <WelcomeBanner />
      <CompanyDashboard viewerMode={getEffectiveRole(account) === "viewer"} />
    </div>
  );
}

// viewerMode: the personal overview replaces the page header and the
// module-snapshot cards, but the permission-gated Anniversaries / Birthdays /
// Awards cards stay — a Viewer still sees other people's milestones and
// awards (whatever their matrix permissions allow), just like everyone else.
function CompanyDashboard({ viewerMode = false }: { viewerMode?: boolean }) {
  const employees = useEmployees();
  const { data: account } = useCurrentAccount();
  // The full cross-office "everything" overview (company-wide headcount,
  // hub distribution, recent hires across the whole workforce) is Admin/
  // Super Admin only — everyone else gets a dashboard scoped to just the
  // module(s) their own permissions actually cover (see the Onboarding/
  // Attendance/Employees snapshot cards below), same as the sidebar and
  // every other page in the app.
  const isFullAccess = isFullAccessRole(getEffectiveRole(account));
  const canManage = canManageEmployees(account?.permissions);
  const canViewEmployeesModule = canViewEmployees(account?.permissions);
  const canViewOnboardingModule = canViewOnboarding(account?.permissions);
  const canViewAttendanceModule = canViewAttendance(account?.permissions);
  const canViewAwardsModule = canViewAwards(account?.permissions);
  const canViewBenefitsModule = canViewBenefits(account?.permissions);
  const m = metrics(employees);
  const dist = officeDistribution(employees);
  const total = dist.reduce((sum, d) => sum + d.active + d.inactive, 0);
  const resignedCount = employees.filter((e) => e.status === "Resigned").length;
  const terminatedCount = employees.filter((e) => e.status === "Terminated").length;
  const [milestoneWindow, setMilestoneWindow] = useState<DashboardMilestoneWindow>("next-30");
  const isUpcomingMilestoneWindow = milestoneWindow === "next-30";
  const milestoneWindowLabel = MILESTONE_TIME_FILTER_LABELS[milestoneWindow];
  const milestoneWindowDirection = isUpcomingMilestoneWindow ? "next" : "last";

  // Dashboard milestone window: Anniversaries and Birthdays can look ahead
  // or back 30 days, so HR can plan upcoming celebrations by default while
  // still keeping the previous recap one click away.
  const recentAnniversaries = anniversaries(employees)
    // Dashboard-only: someone hired this same calendar year hasn't reached a
    // work anniversary yet, so their hire date's month/day would otherwise
    // match "today" (or "in N days") with a nonsensical "0 yr" badge — that's
    // just their start date, not an anniversary of it. The dedicated
    // Anniversaries page (routes/anniversaries.tsx) deliberately still shows
    // these, unchanged.
    .filter((e) => e.years > 0)
    .map((e) => {
      // The "next 30 days" view also keeps anniversaries that already
      // happened EARLIER THIS MONTH, flagged `past` — otherwise someone whose
      // anniversary was yesterday vanishes from the card the very next day,
      // while it's still this month's news. (The "last 30 days" view already
      // looks back on its own.)
      const now = new Date();
      const past =
        isUpcomingMilestoneWindow && e.monthIndex === now.getMonth() && e.day < now.getDate();
      const daysAway = past
        ? daysSinceLastOccurrence(e.monthIndex, e.day)
        : isUpcomingMilestoneWindow
          ? daysUntilNextOccurrence(e.monthIndex, e.day)
          : daysSinceLastOccurrence(e.monthIndex, e.day);
      return { ...e, daysAway, past };
    })
    .filter((e) => e.past || e.daysAway <= RECENT_MILESTONE_DAYS)
    // This month's already-passed ones first (oldest to newest), then the
    // upcoming ones soonest-first.
    .sort((a, b) => {
      if (a.past !== b.past) return a.past ? -1 : 1;
      return a.past ? b.daysAway - a.daysAway : a.daysAway - b.daysAway;
    });
  const recentBirthdays = upcomingBirthdays(employees)
    .map((e) => {
      const daysAway = isUpcomingMilestoneWindow
        ? daysUntilNextOccurrence(e.monthIndex, e.day)
        : daysSinceLastOccurrence(e.monthIndex, e.day);
      return { ...e, daysAway };
    })
    .filter((e) => e.daysAway <= RECENT_MILESTONE_DAYS)
    .sort((a, b) => a.daysAway - b.daysAway);
  const recentNewHires = employees
    .filter((e) => e.status === "Active" && tenureDays(e.startDate) <= RECENT_HIRE_DAYS)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const recentExits = employees
    .flatMap((e) => {
      if (!e.exitDate) return [];
      const daysAgo = Math.round(
        (Date.now() - parseCalendarDate(e.exitDate).getTime()) / 86_400_000,
      );
      return daysAgo >= 0 && daysAgo <= RECENT_MILESTONE_DAYS ? [{ ...e, daysAgo }] : [];
    })
    .sort((a, b) => a.daysAgo - b.daysAgo);

  // The employee lists behind each clickable metric card below — same
  // filters the card's own number is computed from, just kept as arrays
  // instead of a count so the detail modal has something to show.
  const activeEmployees = employees.filter((e) => e.status === "Active");
  const eastwoodActiveEmployees = employees.filter(
    (e) => e.office === "PH Eastwood" && e.status === "Active",
  );
  const medellinActiveEmployees = employees.filter(
    (e) => e.office === "CO Medellin" && e.status === "Active",
  );

  type DashboardMetricKey = "active" | "newHires" | "exits" | "eastwood" | "medellin";
  const [openMetric, setOpenMetric] = useState<DashboardMetricKey | null>(null);
  const metricModalConfig: Record<
    DashboardMetricKey,
    { title: string; description: string; employees: typeof employees; exportBaseName: string }
  > = {
    active: {
      title: "Active Employees",
      description: "Everyone currently employed, across every hub.",
      employees: activeEmployees,
      exportBaseName: "active-employees",
    },
    newHires: {
      title: `New Hires (${RECENT_HIRE_DAYS} days)`,
      description: `Started in the last ${RECENT_HIRE_DAYS} days — still within the training window.`,
      employees: recentNewHires,
      exportBaseName: "new-hires",
    },
    exits: {
      title: `Exits (${RECENT_MILESTONE_DAYS} days)`,
      description: `Departures across every hub in the last ${RECENT_MILESTONE_DAYS} days.`,
      employees: recentExits,
      exportBaseName: "exits",
    },
    eastwood: {
      title: "PH Eastwood (Active)",
      description: "Active employees at the Manila delivery hub.",
      employees: eastwoodActiveEmployees,
      exportBaseName: "ph-eastwood-active",
    },
    medellin: {
      title: "CO Medellin (Active)",
      description: "Active employees at the LATAM delivery hub.",
      employees: medellinActiveEmployees,
      exportBaseName: "co-medellin-active",
    },
  };

  const awards = useAwards(canViewAwardsModule);
  const recentAwards = awards
    .flatMap((a) => {
      const daysAgo = Math.round(
        (Date.now() - parseCalendarDate(a.awardedDate).getTime()) / 86_400_000,
      );
      return daysAgo >= 0 && daysAgo <= RECENT_MILESTONE_DAYS ? [{ ...a, daysAgo }] : [];
    })
    .sort((a, b) => a.daysAgo - b.daysAgo);

  // Cross-module snapshot — every signed-in role sees this, same as every
  // other read in the app (reads stay open across modules; only writes and
  // the deep-dive Analytics page are role/admin-gated). This is the "one
  // dashboard" home view: a person whose role only lets them *manage* one
  // module can still see at a glance what's happening in the others.
  const newHires = useNewHires(canViewOnboardingModule);
  const onboardingStats = {
    total: newHires.length,
    complete: newHires.filter((h) => computeStatus(h) === "Complete").length,
    inProgress: newHires.filter((h) => computeStatus(h) === "In Progress").length,
  };

  const { data: hmoMembersData } = useHmoMembersQuery(canViewBenefitsModule);
  const hmoMembers = hmoMembersData ?? [];
  const hmoStats = {
    active: hmoMembers.filter((m) => m.memberStatus === "Active").length,
    pendingEnrollment: hmoMembers.filter((m) =>
      [
        "For Manager Evaluation",
        "Waiting for Requirements",
        "Ready for Endorsement",
        "Endorsed to ETIQA",
        "For Processing",
      ].includes(m.enrollmentStatus),
    ).length,
    physicalCardsPending: hmoMembers.filter(
      (m) => m.memberStatus === "Active" && m.physicalCardStatus !== "Released to Employee",
    ).length,
  };

  const { data: violationsPage } = useViolationsQuery({}, 0, 500, canViewAttendanceModule);
  const violations = violationsPage?.items ?? [];
  const violationStats = {
    total: violationsPage?.total ?? violations.length,
    pending: violations.filter((v) => !["Sent", "Failed"].includes(v.emailStatus)).length,
    sent: violations.filter((v) => v.emailStatus === "Sent").length,
    failed: violations.filter((v) => v.emailStatus === "Failed").length,
  };

  // Personalization from Settings — each person's Dashboard only shows the
  // cards they've asked to see. Default to shown while the account is still
  // loading, so there's no flash of an empty dashboard.
  const canViewMilestonesModule = canViewMilestones(account?.permissions);
  // "Recent New Hires" is a company-wide list (every office, every
  // department) — part of the Admin/Super Admin overview, not a
  // module-scoped card, so it stays with the rest of that section.
  const showNewHires = isFullAccess && (account?.notify_new_hires ?? true);
  const showAnniversaries = canViewMilestonesModule && (account?.notify_anniversaries ?? true);
  const showBirthdaysCard = canViewMilestonesModule && (account?.notify_birthdays ?? true);
  const showAwardsCard = canViewAwardsModule;

  const [exporting, setExporting] = useState(false);

  // "Export All Data" — a raw, unfiltered dump of every module the signed-in
  // role can already see on this page, as full record-level tables rather
  // than the dashboard's own recent-activity windows. Each section is gated
  // on exactly the same permission the corresponding card above already
  // checks, so this never hands out a table the viewer couldn't otherwise
  // see — it's the same data, just as a downloadable file instead of a
  // paginated mini-table. Reuses Analytics' export engine (same design:
  // dark header band, striped rows) rather than a second implementation.
  function buildExportData(): AnalyticsExportData {
    const summary: { label: string; value: string | number }[] = [];
    const sections: AnalyticsExportData["sections"] = [];

    if (canViewEmployeesModule) {
      summary.push(
        { label: "Total Employees", value: employees.length },
        { label: "Active", value: m.active },
        { label: "Resigned", value: resignedCount },
        { label: "Terminated", value: terminatedCount },
      );
      sections.push({
        title: "Employees",
        columns: ["Name", "Office", "Department", "Position", "Status", "Start Date", "Exit Date"],
        rows: employees.map((e) => [
          e.name,
          e.office,
          e.department,
          e.position,
          e.status,
          formatDate(e.startDate),
          formatDate(e.exitDate),
        ]),
      });
    }

    if (isFullAccess) {
      sections.push({
        title: "Office Distribution",
        columns: ["Office", "Active", "Inactive"],
        rows: dist.map((d) => [d.office, d.active, d.inactive]),
      });
    }

    if (canViewOnboardingModule) {
      summary.push(
        { label: "New Hires Tracked", value: onboardingStats.total },
        { label: "Onboarding In Progress", value: onboardingStats.inProgress },
        { label: "Onboarding Complete", value: onboardingStats.complete },
      );
      sections.push({
        title: "New Hires (Onboarding)",
        columns: ["Name", "Onboarding Status", "Start Date"],
        rows: newHires.map((h) => [h.name, computeStatus(h), formatDate(h.startDate)]),
      });
    }

    if (canViewAttendanceModule) {
      summary.push(
        { label: "Attendance Records", value: violationStats.total },
        { label: "Pending", value: violationStats.pending },
        { label: "Sent", value: violationStats.sent },
        { label: "Failed", value: violationStats.failed },
      );
      sections.push({
        title: "Attendance Violations",
        columns: ["Employee", "Office", "Violation Type", "Date", "Email Status"],
        rows: violations.map((v) => [
          v.employeeName,
          v.office,
          v.violationTypeLabel,
          formatDate(v.violationDate),
          v.emailStatus,
        ]),
      });
    }

    if (showAwardsCard) {
      summary.push({ label: "Awards Given (all-time)", value: awards.length });
      sections.push({
        title: "Recognition & Awards",
        columns: ["Employee", "Office", "Award", "Given By", "Date"],
        rows: awards.map((a) => [
          a.employeeName,
          a.employeeOffice,
          a.title,
          a.awardedByLabel,
          formatDate(a.awardedDate),
        ]),
      });
    }

    return { filterLines: [], summary, sections };
  }

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const data = buildExportData();
      if (format === "xlsx") await exportAnalyticsXlsx(data, "TGO_Dashboard_Full_Export");
      else await exportAnalyticsPdf(data, "TGO_Dashboard_Full_Export");
      toast.success(`All data exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function formatMilestoneRelativeDays(daysAway: number, past = false): string {
    if (daysAway === 0) return "today";
    return isUpcomingMilestoneWindow && !past ? `in ${daysAway}d` : `${daysAway}d ago`;
  }

  const milestoneCards = (showNewHires ||
    showAnniversaries ||
    showBirthdaysCard ||
    showAwardsCard) && (
    <div className="space-y-3">
      {(showAnniversaries || showBirthdaysCard) && (
        <div className="flex justify-end">
          <Select
            value={milestoneWindow}
            onValueChange={(value) => setMilestoneWindow(value as DashboardMilestoneWindow)}
          >
            <SelectTrigger className="w-[160px]" aria-label="Milestone time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_MILESTONE_WINDOWS.map((window) => (
                <SelectItem key={window} value={window}>
                  {MILESTONE_TIME_FILTER_LABELS[window]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {showNewHires && (
          <Card>
            <BandedCardHeader seed="new-hires">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                New Hires ({RECENT_HIRE_DAYS} days)
              </CardTitle>
              <CardDescription>Started in the last {RECENT_HIRE_DAYS} days</CardDescription>
            </BandedCardHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
              {recentNewHires.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No new hires in the last {RECENT_HIRE_DAYS} days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead className="text-right">Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentNewHires.map((e) => {
                      const daysAgo = tenureDays(e.startDate);
                      return (
                        <TableRow
                          key={e.id}
                          className={daysAgo <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                        >
                          <TableCell className="font-medium">
                            <EmployeeNameLink employee={e} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{e.office}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDate(e.startDate)}
                            <span className="ml-1.5 text-xs">
                              ({daysAgo === 0 ? "today" : `${daysAgo}d ago`})
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {showAnniversaries && (
          <Card>
            <BandedCardHeader seed="anniversaries">
              <CardTitle className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                Anniversaries ({milestoneWindowLabel})
              </CardTitle>
              <CardDescription>
                {isUpcomingMilestoneWindow
                  ? `Work anniversaries earlier this month and in the next ${RECENT_MILESTONE_DAYS} days`
                  : `Work anniversaries in the last ${RECENT_MILESTONE_DAYS} days`}
              </CardDescription>
            </BandedCardHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
              {recentAnniversaries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No anniversaries in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Years</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAnniversaries.map((e) => (
                      <TableRow
                        key={e.id}
                        className={e.daysAway <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                      >
                        <TableCell>
                          <p className="font-medium">
                            <EmployeeNameLink employee={e} />
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[e.department, e.office].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.monthName} {e.day}
                          <span className="ml-1.5 text-xs">
                            ({formatMilestoneRelativeDays(e.daysAway, e.past)})
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{formatYears(e.years)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {showBirthdaysCard && (
          <Card>
            <BandedCardHeader seed="birthdays">
              <CardTitle className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-muted-foreground" />
                Birthdays ({milestoneWindowLabel})
              </CardTitle>
              <CardDescription>
                Celebrations in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days
              </CardDescription>
            </BandedCardHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
              {recentBirthdays.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No birthdays in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBirthdays.map((e) => (
                      <TableRow
                        key={e.id}
                        className={e.daysAway <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                      >
                        <TableCell className="font-medium">
                          <EmployeeNameLink employee={e} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.office}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {e.monthName.slice(0, 3)} {e.day}
                          <span className="ml-1.5 text-xs">
                            ({formatMilestoneRelativeDays(e.daysAway)})
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {showAwardsCard && (
          <Card>
            <BandedCardHeader seed="awards">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                Awards ({RECENT_MILESTONE_DAYS} days)
              </CardTitle>
              <CardDescription>
                Recognition given in the last {RECENT_MILESTONE_DAYS} days
              </CardDescription>
            </BandedCardHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
              {recentAwards.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No awards given in the last {RECENT_MILESTONE_DAYS} days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Award</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentAwards.map((a) => (
                      <TableRow
                        key={a.id}
                        className={a.daysAgo <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                      >
                        <TableCell>
                          <p className="font-medium">
                            {(() => {
                              const employee = employees.find((e) => e.id === a.employeeId);
                              return employee ? (
                                <EmployeeNameLink employee={employee} />
                              ) : (
                                a.employeeName
                              );
                            })()}
                          </p>
                          <p className="text-xs text-muted-foreground">{a.employeeOffice}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.description ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default underline decoration-dotted underline-offset-4">
                                  {a.title}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-64">{a.description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            a.title
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatDate(a.awardedDate)}
                          <span className="ml-1.5 text-xs">
                            ({a.daysAgo === 0 ? "today" : `${a.daysAgo}d ago`})
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {viewerMode ? (
        <MyOverview topSlot={milestoneCards} />
      ) : (
        <PageHeader
          title="Dashboard"
          description={
            isFullAccess
              ? "Operational snapshot across all TGO delivery hubs."
              : "Snapshot of the modules available to your role."
          }
          action={
            <div className="flex items-center gap-2">
              {canManage && <ImportEmployeesDialog />}
              <Button asChild size="sm" variant="outline">
                <Link to="/directory">
                  Open directory <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exporting}>
                    {exporting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Export All Data
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("xlsx")}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("pdf")}>
                    <FileText className="mr-2 h-4 w-4" /> Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      )}

      {viewerMode ? null : milestoneCards}

      {isFullAccess && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Exits in the Last {RECENT_MILESTONE_DAYS} Days
            </CardTitle>
            <CardDescription>Departures across every hub, most recent first</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentExits.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No departures in the last {RECENT_MILESTONE_DAYS} days.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Exit Date</TableHead>
                      <TableHead className="text-right">Days Ago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentExits.map((e) => (
                      <TableRow
                        key={e.id}
                        className={e.daysAgo <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                      >
                        <TableCell className="font-medium">
                          <EmployeeNameLink employee={e} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={EXIT_STATUS_VARIANT[e.status] ?? "secondary"}>
                            {e.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.office}</TableCell>
                        <TableCell className="text-muted-foreground">{e.department}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(e.exitDate)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {e.daysAgo === 0 ? "today" : `${e.daysAgo} days`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isFullAccess && (
        // Exactly 5 cards since Resigned/Terminated moved into their own
        // modal — xl:grid-cols-5 fills one full row at wide viewports
        // instead of leaving a lone orphan card on its own line.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            title="Active Employees"
            value={m.active}
            hint="Currently employed"
            icon={Users}
            onClick={() => setOpenMetric("active")}
          />
          <MetricCard
            title="New Hires"
            value={recentNewHires.length}
            hint={`Started in last ${RECENT_HIRE_DAYS} days`}
            icon={UserPlus}
            onClick={() => setOpenMetric("newHires")}
          />
          <MetricCard
            title="Exits"
            value={recentExits.length}
            hint={`Departures in last ${RECENT_MILESTONE_DAYS} days`}
            icon={LogOut}
            onClick={() => setOpenMetric("exits")}
          />
          <MetricCard
            title="PH Eastwood (Active)"
            value={m.eastwood}
            hint="Manila delivery hub"
            icon={Building2}
            onClick={() => setOpenMetric("eastwood")}
          />
          <MetricCard
            title="CO Medellin (Active)"
            value={m.medellin}
            hint="LATAM delivery hub"
            icon={Globe2}
            onClick={() => setOpenMetric("medellin")}
          />
        </div>
      )}

      {openMetric && (
        <MetricDetailModal
          open={!!openMetric}
          onOpenChange={(next) => {
            if (!next) setOpenMetric(null);
          }}
          {...metricModalConfig[openMetric]}
        />
      )}

      {(isFullAccess &&
        (canViewOnboardingModule || canViewAttendanceModule || canViewBenefitsModule)) ||
      (!isFullAccess &&
        (canViewEmployeesModule ||
          canViewOnboardingModule ||
          canViewAttendanceModule ||
          canViewBenefitsModule) &&
        !viewerMode) ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!isFullAccess && canViewEmployeesModule && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Employees Snapshot
                </CardTitle>
                <CardDescription>Headcount at a glance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-semibold">{m.active}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{resignedCount}</p>
                    <p className="text-xs text-muted-foreground">Resigned</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{terminatedCount}</p>
                    <p className="text-xs text-muted-foreground">Terminated</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{recentNewHires.length}</p>
                    <p className="text-xs text-muted-foreground">New Hires</p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to="/directory">
                    Open directory <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
          {canViewOnboardingModule && (
            <SnapshotCard
              seed="snapshot-onboarding"
              icon={ClipboardCheck}
              title="Onboarding Snapshot"
              description="New hires moving through the checklist"
              stats={[
                { label: "Tracked", value: onboardingStats.total, tone: "slate" },
                { label: "In Progress", value: onboardingStats.inProgress, tone: "teal" },
                { label: "Complete", value: onboardingStats.complete, tone: "green" },
              ]}
              to="/onboarding"
              cta="Open onboarding"
            />
          )}

          {canViewBenefitsModule && (
            <SnapshotCard
              seed="snapshot-hmo"
              icon={HeartPulse}
              title="HMO Snapshot"
              description="Eligibility, enrollment and card status"
              stats={[
                { label: "Active", value: hmoStats.active, tone: "green" },
                { label: "Pending Enrollment", value: hmoStats.pendingEnrollment, tone: "teal" },
                { label: "Cards Pending", value: hmoStats.physicalCardsPending, tone: "slate" },
              ]}
              to="/hmo-management"
              cta="Open HMO Management"
            />
          )}

          {canViewAttendanceModule && (
            <SnapshotCard
              seed="snapshot-attendance"
              icon={ShieldAlert}
              title="Attendance Snapshot"
              description="Violation records across every status"
              stats={[
                { label: "Pending", value: violationStats.pending, tone: "teal" },
                { label: "Sent", value: violationStats.sent, tone: "green" },
                { label: "Failed", value: violationStats.failed, tone: "alert" },
              ]}
              to="/attendance-violations"
              cta="Open attendance"
            />
          )}
        </div>
      ) : null}

      {isFullAccess && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HeadcountTrendChart employees={employees} />
          </div>

          <HubUtilisationCard offices={dist} />
        </div>
      )}
    </div>
  );
}
