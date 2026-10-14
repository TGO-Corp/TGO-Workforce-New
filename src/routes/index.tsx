import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-shell";
import { CompanyMetrics } from "@/components/dashboard/company-metrics";
import { DashboardActions } from "@/components/dashboard/dashboard-actions";
import { MilestoneCards } from "@/components/dashboard/milestone-cards";
import { ModuleSnapshots } from "@/components/dashboard/module-snapshots";
import { RecentExitsCard } from "@/components/dashboard/recent-exits-card";
import { HubUtilisationCard } from "@/components/hub-utilisation-card";
import { MyOverview } from "@/components/my-overview";
import { WelcomeBanner } from "@/components/welcome-banner";
import { HeadcountTrendChart } from "@/components/workforce-charts";
import { useQuery } from "@tanstack/react-query";
import { NeedsAttention, type AttentionItem } from "@/components/dashboard/needs-attention";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchReportPreview } from "@/data/violation-api";
import { useAwardsQuery } from "@/data/award-store";
import { useEmployeesQuery } from "@/data/employee-store";
import { metrics, officeDistribution } from "@/data/employees";
import { useHmoMembersQuery } from "@/data/hmo-store";
import { useNewHiresQuery } from "@/data/new-hire-store";
import { useViolationsQuery } from "@/data/violation-store";
import {
  hmoSnapshotStats,
  onboardingSnapshotStats,
  recentExits as findRecentExits,
  recentNewHires as findRecentNewHires,
} from "@/lib/dashboard-data";
import { buildDashboardExport } from "@/lib/dashboard-export";
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
import { useCurrentAccount } from "@/lib/session";

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

// The dashboard fetches only the modules the current account can view.
function Dashboard() {
  const { data: account } = useCurrentAccount();
  return (
    <div className="space-y-4">
      <WelcomeBanner />
      <CompanyDashboard viewerMode={getEffectiveRole(account) === "viewer"} />
    </div>
  );
}

function CompanyDashboard({ viewerMode = false }: { viewerMode?: boolean }) {
  const { data: account } = useCurrentAccount();
  const isFullAccess = isFullAccessRole(getEffectiveRole(account));
  const canManage = canManageEmployees(account?.permissions);
  const canViewEmployeesModule = canViewEmployees(account?.permissions);
  const canViewOnboardingModule = canViewOnboarding(account?.permissions);
  const canViewAttendanceModule = canViewAttendance(account?.permissions);
  const canViewAwardsModule = canViewAwards(account?.permissions);
  const canViewBenefitsModule = canViewBenefits(account?.permissions);
  const canViewMilestonesModule = canViewEmployeesModule && canViewMilestones(account?.permissions);

  const employeeQuery = useEmployeesQuery(canViewEmployeesModule);
  const employees = canViewEmployeesModule ? (employeeQuery.data ?? []) : [];
  const awardQuery = useAwardsQuery(canViewAwardsModule);
  const awards = canViewAwardsModule ? (awardQuery.data ?? []) : [];
  const onboardingQuery = useNewHiresQuery(canViewOnboardingModule);
  const newHires = canViewOnboardingModule ? (onboardingQuery.data ?? []) : [];
  const hmoQuery = useHmoMembersQuery(canViewBenefitsModule);
  const hmoMembers = canViewBenefitsModule ? (hmoQuery.data ?? []) : [];
  // Full status aggregates, independent of the paginated export preview.
  const violationSummary = useQuery({
    queryKey: ["violations", "dashboard-summary"],
    queryFn: () => fetchReportPreview({}),
    enabled: canViewAttendanceModule,
    refetchInterval: canViewAttendanceModule ? 15_000 : false,
  });
  const { data: violationsPage } = useViolationsQuery({}, 0, 500, canViewAttendanceModule);
  const m = metrics(employees);
  const dist = officeDistribution(employees);
  const resignedCount = employees.filter((employee) => employee.status === "Resigned").length;
  const terminatedCount = employees.filter((employee) => employee.status === "Terminated").length;
  const recentNewHires = findRecentNewHires(employees);
  const recentExits = findRecentExits(employees);
  const onboardingStats = onboardingSnapshotStats(newHires);
  const hmoStats = hmoSnapshotStats(hmoMembers);
  const statusCounts = violationSummary.data?.byStatus ?? {};
  const violationStats = {
    total: violationSummary.data?.total ?? 0,
    pending: Object.entries(statusCounts).reduce(
      (total, [status, count]) => total + (status === "Sent" || status === "Failed" ? 0 : count),
      0,
    ),
    sent: statusCounts["Sent"] ?? 0,
    failed: statusCounts["Failed"] ?? 0,
  };
  const states = {
    employees: { loading: employeeQuery.isLoading, unavailable: employeeQuery.isError },
    onboarding: { loading: onboardingQuery.isLoading, unavailable: onboardingQuery.isError },
    hmo: { loading: hmoQuery.isLoading, unavailable: hmoQuery.isError },
    attendance: { loading: violationSummary.isLoading, unavailable: violationSummary.isError },
  };
  const showNewHires =
    isFullAccess && canViewEmployeesModule && (account?.notify_new_hires ?? true);
  const showAnniversaries = canViewMilestonesModule && (account?.notify_anniversaries ?? true);
  const showBirthdaysCard = canViewMilestonesModule && (account?.notify_birthdays ?? true);
  const showAwardsCard = canViewAwardsModule;
  const showPeople = showNewHires || showAnniversaries || showBirthdaysCard || showAwardsCard;
  const milestoneCards = (
    <MilestoneCards
      employees={employees}
      awards={awards}
      newHires={recentNewHires}
      showNewHires={showNewHires}
      showAnniversaries={showAnniversaries}
      showBirthdays={showBirthdaysCard}
      showAwards={showAwardsCard}
      employeesLoading={employeeQuery.isLoading}
      employeesError={employeeQuery.isError}
      awardsLoading={awardQuery.isLoading}
      awardsError={awardQuery.isError}
    />
  );

  const attentionItems: AttentionItem[] = [
    ...(canViewAttendanceModule
      ? [
          {
            label: "Failed notifications",
            description: "Review delivery failures",
            count: violationStats.failed,
            to: "/attendance-violations" as const,
            tone: "danger" as const,
            ...states.attendance,
          },
          {
            label: "Violations awaiting review",
            description: "Prepared emails awaiting approval",
            count: statusCounts["Email Prepared"] ?? 0,
            to: "/attendance-violations" as const,
            ...states.attendance,
          },
          {
            label: "Violations to prepare",
            description: "Records ready for preparation",
            count: statusCounts["Ready to Prepare"] ?? 0,
            to: "/attendance-violations" as const,
            ...states.attendance,
          },
        ]
      : []),
    ...(canViewOnboardingModule
      ? [
          {
            label: "Incomplete onboarding",
            description: "Checklists with steps remaining",
            count: onboardingStats.total - onboardingStats.complete,
            to: "/onboarding" as const,
            ...states.onboarding,
          },
        ]
      : []),
    ...(canViewBenefitsModule
      ? [
          {
            label: "HMO enrollment pending",
            description: "Members moving through enrollment",
            count: hmoStats.pendingEnrollment,
            to: "/hmo-management" as const,
            ...states.hmo,
          },
          {
            label: "HMO removal pending",
            description: "Required removals still outstanding",
            count: hmoMembers.filter(
              (member) => member.removalRequired && member.removalStatus !== "Removed",
            ).length,
            to: "/hmo-management" as const,
            ...states.hmo,
          },
        ]
      : []),
  ];
  const exportUnavailable =
    (canViewEmployeesModule && (employeeQuery.isPending || employeeQuery.isError)) ||
    (canViewOnboardingModule && (onboardingQuery.isPending || onboardingQuery.isError)) ||
    (canViewAwardsModule && (awardQuery.isPending || awardQuery.isError)) ||
    (canViewAttendanceModule &&
      (violationSummary.isPending || violationSummary.isError || !violationsPage));

  function buildExportData() {
    return buildDashboardExport({
      canViewEmployees: canViewEmployeesModule,
      canViewOnboarding: canViewOnboardingModule,
      canViewAttendance: canViewAttendanceModule,
      canViewAwards: showAwardsCard,
      isFullAccess,
      employees,
      activeCount: m.active,
      resignedCount,
      terminatedCount,
      officeDistribution: dist,
      newHires,
      onboardingStats,
      violations: violationsPage?.items ?? [],
      violationStats,
      awards,
    });
  }

  return (
    <div className="space-y-5">
      {viewerMode ? (
        <MyOverview topSlot={milestoneCards} />
      ) : (
        <>
          <PageHeader
            title="Dashboard"
            description={
              isFullAccess
                ? "Your workforce at a glance. Start with what needs attention."
                : "Your modules, pending work, and people updates in one place."
            }
            action={
              <DashboardActions
                canManage={canManage}
                canViewEmployees={canViewEmployeesModule}
                disabled={exportUnavailable}
                buildExportData={buildExportData}
              />
            }
          />
          {isFullAccess && canViewEmployeesModule && (
            <CompanyMetrics
              employees={employees}
              newHires={recentNewHires}
              exits={recentExits}
              counts={{ active: m.active, eastwood: m.eastwood, medellin: m.medellin }}
              loading={employeeQuery.isLoading}
              unavailable={employeeQuery.isError}
            />
          )}
          <div
            className={
              isFullAccess && canViewEmployeesModule ? "grid items-start gap-4 xl:grid-cols-3" : ""
            }
          >
            {isFullAccess && canViewEmployeesModule && (
              <div className="min-w-0 xl:col-span-2">
                {employeeQuery.isLoading ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Headcount trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-[260px] w-full" />
                    </CardContent>
                  </Card>
                ) : employeeQuery.isError ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Headcount trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="py-20 text-center text-sm text-muted-foreground">
                        Unable to load workforce data. Refresh to retry.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <HeadcountTrendChart employees={employees} />
                )}
              </div>
            )}
            <NeedsAttention items={attentionItems} />
          </div>
        </>
      )}

      <ModuleSnapshots
        isFullAccess={isFullAccess}
        viewerMode={viewerMode}
        canViewEmployees={canViewEmployeesModule}
        canViewOnboarding={canViewOnboardingModule}
        canViewAttendance={canViewAttendanceModule}
        canViewBenefits={canViewBenefitsModule}
        headcount={{
          active: m.active,
          resigned: resignedCount,
          terminated: terminatedCount,
          newHires: recentNewHires.length,
        }}
        onboarding={onboardingStats}
        hmo={hmoStats}
        attendance={violationStats}
        states={states}
      />

      {!viewerMode && showPeople && milestoneCards}

      {!viewerMode && isFullAccess && canViewEmployeesModule && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <RecentExitsCard
              exits={recentExits}
              loading={employeeQuery.isLoading}
              unavailable={employeeQuery.isError}
            />
          </div>
          {employeeQuery.isLoading ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : employeeQuery.isError ? null : (
            <HubUtilisationCard offices={dist} />
          )}
        </div>
      )}
    </div>
  );
}
