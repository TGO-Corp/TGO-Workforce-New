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
import { useAwards } from "@/data/award-store";
import { useEmployees } from "@/data/employee-store";
import { metrics, officeDistribution } from "@/data/employees";
import { useHmoMembersQuery } from "@/data/hmo-store";
import { useNewHires } from "@/data/new-hire-store";
import { useViolationsQuery } from "@/data/violation-store";
import {
  attendanceSnapshotStats,
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

// This file only fetches the data and decides what each role sees; the
// calculations live in @/lib/dashboard-data and @/lib/dashboard-export, and each
// block of the page is its own component under @/components/dashboard.
//
// viewerMode: the personal overview replaces the page header and the
// module-snapshot cards, but the permission-gated Anniversaries / Birthdays /
// Awards cards stay — a Viewer still sees other people's milestones and
// awards (whatever their matrix permissions allow), just like everyone else.
function CompanyDashboard({ viewerMode = false }: { viewerMode?: boolean }) {
  const employees = useEmployees();
  const { data: account } = useCurrentAccount();
  // The full cross-office "everything" overview (company-wide headcount, hub
  // distribution, recent hires across the whole workforce) is Admin/Super Admin
  // only — everyone else gets a dashboard scoped to just the module(s) their own
  // permissions actually cover, same as the sidebar and every other page in the
  // app.
  const isFullAccess = isFullAccessRole(getEffectiveRole(account));
  const canManage = canManageEmployees(account?.permissions);
  const canViewEmployeesModule = canViewEmployees(account?.permissions);
  const canViewOnboardingModule = canViewOnboarding(account?.permissions);
  const canViewAttendanceModule = canViewAttendance(account?.permissions);
  const canViewAwardsModule = canViewAwards(account?.permissions);
  const canViewBenefitsModule = canViewBenefits(account?.permissions);
  const canViewMilestonesModule = canViewMilestones(account?.permissions);

  // --- Headcount -----------------------------------------------------------
  const m = metrics(employees);
  const dist = officeDistribution(employees);
  const resignedCount = employees.filter((e) => e.status === "Resigned").length;
  const terminatedCount = employees.filter((e) => e.status === "Terminated").length;
  const recentNewHires = findRecentNewHires(employees);
  const recentExits = findRecentExits(employees);

  // --- Cross-module snapshot data ---------------------------------------------
  // Every signed-in role sees this, same as every other read in the app (reads
  // stay open across modules; only writes and the deep-dive Analytics page are
  // role/admin-gated). This is the "one dashboard" home view: a person whose
  // role only lets them *manage* one module can still see at a glance what's
  // happening in the others.
  const awards = useAwards(canViewAwardsModule);
  const newHires = useNewHires(canViewOnboardingModule);
  const onboardingStats = onboardingSnapshotStats(newHires);
  const { data: hmoMembersData } = useHmoMembersQuery(canViewBenefitsModule);
  const hmoStats = hmoSnapshotStats(hmoMembersData ?? []);
  const { data: violationsPage } = useViolationsQuery({}, 0, 500, canViewAttendanceModule);
  const violationStats = attendanceSnapshotStats(violationsPage);

  // Personalization from Settings — each person's Dashboard only shows the
  // cards they've asked to see. Default to shown while the account is still
  // loading, so there's no flash of an empty dashboard. "Recent New Hires" is a
  // company-wide list (every office, every department) — part of the
  // Admin/Super Admin overview, not a module-scoped card.
  const showNewHires = isFullAccess && (account?.notify_new_hires ?? true);
  const showAnniversaries = canViewMilestonesModule && (account?.notify_anniversaries ?? true);
  const showBirthdaysCard = canViewMilestonesModule && (account?.notify_birthdays ?? true);
  const showAwardsCard = canViewAwardsModule;

  const milestoneCards = (
    <MilestoneCards
      employees={employees}
      awards={awards}
      newHires={recentNewHires}
      showNewHires={showNewHires}
      showAnniversaries={showAnniversaries}
      showBirthdays={showBirthdaysCard}
      showAwards={showAwardsCard}
    />
  );

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
          action={<DashboardActions canManage={canManage} buildExportData={buildExportData} />}
        />
      )}

      {viewerMode ? null : milestoneCards}

      {isFullAccess && <RecentExitsCard exits={recentExits} />}

      {isFullAccess && (
        <CompanyMetrics
          employees={employees}
          newHires={recentNewHires}
          exits={recentExits}
          counts={{ active: m.active, eastwood: m.eastwood, medellin: m.medellin }}
        />
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
      />

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
