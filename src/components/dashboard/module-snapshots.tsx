// The Dashboard's module snapshot grid: Employees (non-admin roles only), then
// Onboarding, HMO and Attendance, each shown only to roles whose permissions
// cover that module. Moved out of src/routes/index.tsx unchanged.

import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, HeartPulse, ShieldAlert, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SnapshotCard } from "@/components/snapshot-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ModuleSnapshots({
  isFullAccess,
  viewerMode,
  canViewEmployees,
  canViewOnboarding,
  canViewAttendance,
  canViewBenefits,
  headcount,
  onboarding,
  hmo,
  attendance,
  states,
}: {
  isFullAccess: boolean;
  /** A Viewer sees the personal overview instead of any module snapshot. */
  viewerMode: boolean;
  canViewEmployees: boolean;
  canViewOnboarding: boolean;
  canViewAttendance: boolean;
  canViewBenefits: boolean;
  headcount: { active: number; resigned: number; terminated: number; newHires: number };
  onboarding: { total: number; inProgress: number; complete: number };
  hmo: { active: number; pendingEnrollment: number; physicalCardsPending: number };
  attendance: { pending: number; sent: number; failed: number };
  states: Record<
    "employees" | "onboarding" | "hmo" | "attendance",
    { loading: boolean; unavailable: boolean }
  >;
}) {
  const showSection =
    (isFullAccess && (canViewOnboarding || canViewAttendance || canViewBenefits)) ||
    (!isFullAccess &&
      (canViewEmployees || canViewOnboarding || canViewAttendance || canViewBenefits) &&
      !viewerMode);
  if (!showSection) return null;

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
      {!isFullAccess && canViewEmployees && (
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
                {states.employees.loading ? (
                  <Skeleton className="mx-auto h-8 w-10" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">
                    {states.employees.unavailable ? "—" : headcount.active}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div>
                {states.employees.loading ? (
                  <Skeleton className="mx-auto h-8 w-10" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">
                    {states.employees.unavailable ? "—" : headcount.resigned}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Resigned</p>
              </div>
              <div>
                {states.employees.loading ? (
                  <Skeleton className="mx-auto h-8 w-10" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">
                    {states.employees.unavailable ? "—" : headcount.terminated}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Terminated</p>
              </div>
              <div>
                {states.employees.loading ? (
                  <Skeleton className="mx-auto h-8 w-10" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">
                    {states.employees.unavailable ? "—" : headcount.newHires}
                  </p>
                )}
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
      {canViewOnboarding && (
        <SnapshotCard
          seed="snapshot-onboarding"
          {...states.onboarding}
          icon={ClipboardCheck}
          title="Onboarding Snapshot"
          description="New hires moving through the checklist"
          stats={[
            { label: "Tracked", value: onboarding.total, tone: "slate" },
            { label: "In Progress", value: onboarding.inProgress, tone: "teal" },
            { label: "Complete", value: onboarding.complete, tone: "green" },
          ]}
          to="/onboarding"
          cta="Open onboarding"
        />
      )}

      {canViewBenefits && (
        <SnapshotCard
          seed="snapshot-hmo"
          {...states.hmo}
          icon={HeartPulse}
          title="HMO Snapshot"
          description="Eligibility, enrollment and card status"
          stats={[
            { label: "Active", value: hmo.active, tone: "green" },
            { label: "Pending Enrollment", value: hmo.pendingEnrollment, tone: "teal" },
            { label: "Cards Pending", value: hmo.physicalCardsPending, tone: "slate" },
          ]}
          to="/hmo-management"
          cta="Open HMO Management"
        />
      )}

      {canViewAttendance && (
        <SnapshotCard
          seed="snapshot-attendance"
          {...states.attendance}
          icon={ShieldAlert}
          title="Violations Snapshot"
          description="Violation records across every status"
          stats={[
            { label: "Pending", value: attendance.pending, tone: "teal" },
            { label: "Sent", value: attendance.sent, tone: "green" },
            { label: "Failed", value: attendance.failed, tone: "alert" },
          ]}
          to="/attendance-violations"
          cta="Open violations"
        />
      )}
    </div>
  );
}
