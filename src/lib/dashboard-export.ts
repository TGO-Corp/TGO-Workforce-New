// "Export All Data" on the Dashboard — a raw, unfiltered dump of every module the
// signed-in role can already see on that page, as full record-level tables
// rather than the Dashboard's own recent-activity windows. Each section is gated
// on exactly the same permission the matching card checks, so this never hands
// out a table the viewer couldn't otherwise see — it's the same data, just as a
// downloadable file instead of a paginated mini-table. Reuses Analytics' export
// engine (same design: dark header band, striped rows) rather than a second
// implementation.
//
// Moved out of src/routes/index.tsx unchanged; the page passes in the data it
// already has.

import type { Award } from "@/data/award-api";
import { formatDate, type Employee } from "@/data/employees";
import { computeStatus } from "@/data/new-hire-api";
import type { ViolationRecord } from "@/data/violation-api";
import type { AnalyticsExportData } from "@/lib/analytics-export";

export type DashboardExportInput = {
  // Which sections the signed-in account may include.
  canViewEmployees: boolean;
  canViewOnboarding: boolean;
  canViewAttendance: boolean;
  canViewAwards: boolean;
  isFullAccess: boolean;

  employees: Employee[];
  activeCount: number;
  resignedCount: number;
  terminatedCount: number;
  officeDistribution: { office: string; active: number; inactive: number }[];

  newHires: Parameters<typeof computeStatus>[0][];
  onboardingStats: { total: number; inProgress: number; complete: number };

  violations: ViolationRecord[];
  violationStats: { total: number; pending: number; sent: number; failed: number };

  awards: Award[];
};

export function buildDashboardExport(input: DashboardExportInput): AnalyticsExportData {
  const summary: { label: string; value: string | number }[] = [];
  const sections: AnalyticsExportData["sections"] = [];

  if (input.canViewEmployees) {
    summary.push(
      { label: "Total Employees", value: input.employees.length },
      { label: "Active", value: input.activeCount },
      { label: "Resigned", value: input.resignedCount },
      { label: "Terminated", value: input.terminatedCount },
    );
    sections.push({
      title: "Employees",
      columns: ["Name", "Office", "Department", "Position", "Status", "Start Date", "Exit Date"],
      rows: input.employees.map((e) => [
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

  if (input.isFullAccess) {
    sections.push({
      title: "Office Distribution",
      columns: ["Office", "Active", "Inactive"],
      rows: input.officeDistribution.map((d) => [d.office, d.active, d.inactive]),
    });
  }

  if (input.canViewOnboarding) {
    summary.push(
      { label: "New Hires Tracked", value: input.onboardingStats.total },
      { label: "Onboarding In Progress", value: input.onboardingStats.inProgress },
      { label: "Onboarding Complete", value: input.onboardingStats.complete },
    );
    sections.push({
      title: "New Hires (Onboarding)",
      columns: ["Name", "Onboarding Status", "Start Date"],
      rows: input.newHires.map((h) => [h.name, computeStatus(h), formatDate(h.startDate)]),
    });
  }

  if (input.canViewAttendance) {
    summary.push(
      { label: "Attendance Records", value: input.violationStats.total },
      { label: "Pending", value: input.violationStats.pending },
      { label: "Sent", value: input.violationStats.sent },
      { label: "Failed", value: input.violationStats.failed },
    );
    sections.push({
      title: "Attendance Violations",
      columns: ["Employee", "Office", "Violation Type", "Date", "Email Status"],
      rows: input.violations.map((v) => [
        v.employeeName,
        v.office,
        v.violationTypeLabel,
        formatDate(v.violationDate),
        v.emailStatus,
      ]),
    });
  }

  if (input.canViewAwards) {
    summary.push({ label: "Awards Given (all-time)", value: input.awards.length });
    sections.push({
      title: "Recognition & Awards",
      columns: ["Employee", "Office", "Award", "Given By", "Date"],
      rows: input.awards.map((a) => [
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
