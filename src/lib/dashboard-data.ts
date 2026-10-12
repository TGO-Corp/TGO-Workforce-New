// The Dashboard's calculations, kept out of the page so they can be read (and
// tested) on their own: who counts as a recent hire / exit / anniversary /
// birthday / award, and the counts behind each module snapshot card. Pure
// functions of the data passed in — no hooks, no React — moved here unchanged
// from src/routes/index.tsx.

import type { Award } from "@/data/award-api";
import type { HmoMember } from "@/data/hmo-api";
import {
  anniversaries,
  daysSinceLastOccurrence,
  daysUntilNextOccurrence,
  parseCalendarDate,
  tenureDays,
  upcomingBirthdays,
  type Employee,
} from "@/data/employees";
import { computeStatus } from "@/data/new-hire-api";
import type { ViolationRecord } from "@/data/violation-api";

export const RECENT_MILESTONE_DAYS = 30;
export const RECENT_HIRE_DAYS = 14;
// Rows within this many days get a highlighted background in the detailed
// tables — "just happened", worth the eye going there first.
export const SOON_THRESHOLD_DAYS = 3;

export type DashboardMilestoneWindow = "next-30" | "last-30";
export const DASHBOARD_MILESTONE_WINDOWS: DashboardMilestoneWindow[] = ["next-30", "last-30"];

type OnboardingHire = Parameters<typeof computeStatus>[0];

/** Dashboard milestone window: Anniversaries and Birthdays can look ahead or
 * back 30 days, so HR can plan upcoming celebrations by default while still
 * keeping the previous recap one click away. `upcoming` is the "next 30 days"
 * window. */
export function recentAnniversaries(employees: Employee[], upcoming: boolean) {
  return (
    anniversaries(employees)
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
        const past = upcoming && e.monthIndex === now.getMonth() && e.day < now.getDate();
        const daysAway = past
          ? daysSinceLastOccurrence(e.monthIndex, e.day)
          : upcoming
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
      })
  );
}

export function recentBirthdays(employees: Employee[], upcoming: boolean) {
  return upcomingBirthdays(employees)
    .map((e) => {
      const daysAway = upcoming
        ? daysUntilNextOccurrence(e.monthIndex, e.day)
        : daysSinceLastOccurrence(e.monthIndex, e.day);
      return { ...e, daysAway };
    })
    .filter((e) => e.daysAway <= RECENT_MILESTONE_DAYS)
    .sort((a, b) => a.daysAway - b.daysAway);
}

export function recentNewHires(employees: Employee[]) {
  return employees
    .filter((e) => e.status === "Active" && tenureDays(e.startDate) <= RECENT_HIRE_DAYS)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function recentExits(employees: Employee[]) {
  return employees
    .flatMap((e) => {
      if (!e.exitDate) return [];
      const daysAgo = Math.round(
        (Date.now() - parseCalendarDate(e.exitDate).getTime()) / 86_400_000,
      );
      return daysAgo >= 0 && daysAgo <= RECENT_MILESTONE_DAYS ? [{ ...e, daysAgo }] : [];
    })
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

export function recentAwards(awards: Award[]) {
  return awards
    .flatMap((a) => {
      const daysAgo = Math.round(
        (Date.now() - parseCalendarDate(a.awardedDate).getTime()) / 86_400_000,
      );
      return daysAgo >= 0 && daysAgo <= RECENT_MILESTONE_DAYS ? [{ ...a, daysAgo }] : [];
    })
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

// --- Module snapshot counts ---------------------------------------------------

export function onboardingSnapshotStats(newHires: OnboardingHire[]) {
  return {
    total: newHires.length,
    complete: newHires.filter((h) => computeStatus(h) === "Complete").length,
    inProgress: newHires.filter((h) => computeStatus(h) === "In Progress").length,
  };
}

export function hmoSnapshotStats(hmoMembers: HmoMember[]) {
  return {
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
}

export function attendanceSnapshotStats(
  violationsPage: { items: ViolationRecord[]; total: number } | undefined,
) {
  const violations = violationsPage?.items ?? [];
  return {
    total: violationsPage?.total ?? violations.length,
    pending: violations.filter((v) => !["Sent", "Failed"].includes(v.emailStatus)).length,
    sent: violations.filter((v) => v.emailStatus === "Sent").length,
    failed: violations.filter((v) => v.emailStatus === "Failed").length,
  };
}
