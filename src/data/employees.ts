export type EmployeeStatus = "Active" | "Resigned" | "Terminated";

export interface Employee {
  id: string;
  name: string;
  office: string;
  department: string;
  position: string;
  // Free text and admin-editable via list-options-store (@/data/list-options-api's
  // "levels" list), same as department/position — not a fixed enum. Empty
  // string until someone sets it; the Directory renders that as "—" rather
  // than defaulting to a level nobody actually assigned.
  level: string;
  jobOfferDate?: string; // ISO
  startDate: string; // ISO
  status: EmployeeStatus;
  exitDate?: string;
  birthday: string; // ISO (year may be birth year); "" when unknown
  sourceType?: string;
  createdAt?: string; // ISO timestamp — when the record was added to HR Operations
  updatedAt?: string; // ISO timestamp — last edit to the record
}

export const OFFICES = ["PH Eastwood", "CO Medellin"] as const;

export const DEPARTMENTS = [
  "Dispatch",
  "Business Admin",
  "Recruitment",
  "Management",
  "Sales",
  "FHP",
  "Projects",
  "Payroll",
] as const;

export const POSITIONS = [
  "L1 - Dispatcher",
  "L2 - Dispatcher",
  "Spanish Dispatcher",
  "Dispatch Lead",
  "Dispatch Supervisor",
  "Business Associate",
  "Recruitment Associate",
  "Talent Acquisition Lead",
  "Sales Representative",
  "US Payroll Specialists",
  "Payroll Associate",
  "FHP - VA",
  "FHP - Bid Coordinator",
  "Chief of Staff",
  "HR Transport",
  "Onboarding & Offboarding Specialist",
  "AI & Automations Lead",
  "Head of BA",
  "Head of Dispatch",
  "Head of HR",
  "Head of Projects & Payroll",
] as const;

export const STATUSES: EmployeeStatus[] = ["Active", "Resigned", "Terminated"];

/** Parses a plain "YYYY-MM-DD" calendar date (birthday, start date, exit
 * date, job offer date) as LOCAL midnight instead of UTC midnight.
 *
 * `new Date("YYYY-MM-DD")` is specced to parse date-only strings as UTC, but
 * every local-timezone-aware read of that Date — `.toLocaleDateString()`,
 * `.getMonth()`/`.getDate()`/`.getFullYear()`, or comparing it against a
 * real `new Date()` "now" — then silently shifts it by a day for anyone
 * viewing from a timezone behind UTC. That's exactly the bug reported
 * 2026-09-03: a birthday entered and stored as 2003-06-16 (and shown
 * correctly as 06/16/2003 in the `<input type="date">`, which doesn't do
 * this conversion) was rendering as "Jun 15, 2003" everywhere `formatDate()`
 * touched it. Appending a bare time-of-day with no "Z"/offset makes the
 * `Date` constructor parse it as local time instead, which is what a
 * calendar date — something with no timezone of its own — actually needs.
 * A full backend timestamp (createdAt/updatedAt) isn't a plain date-only
 * string, so it falls through to a normal parse and keeps converting from
 * UTC to the viewer's local time as it should. */
export function parseCalendarDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

/** Raw day count between start and (exit or today) — the source of truth for
 * every "how long has this person been here" display and export column. */
export function tenureDays(startDate: string, exitDate?: string) {
  const start = parseCalendarDate(startDate);
  const end = exitDate ? parseCalendarDate(exitDate) : new Date();
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

// "Training" isn't a real employment status — it's a computed label layered
// on top of Active for anyone still inside their first two weeks, so the
// Directory can flag brand-new starters at a glance without adding a new
// value to the actual status enum (which the backend, exports and every
// other status-based filter treat as a real employment state — Active,
// Resigned or Terminated — not a training phase within Active).
export const TRAINING_PERIOD_DAYS = 14;

export function isInTraining(employee: Employee): boolean {
  return employee.status === "Active" && tenureDays(employee.startDate) <= TRAINING_PERIOD_DAYS;
}

export function tenure(startDate: string, exitDate?: string) {
  const start = parseCalendarDate(startDate);
  const end = exitDate ? parseCalendarDate(exitDate) : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(months, 0);
  const y = Math.floor(months / 12);
  const m = months % 12;
  // Under a month, "0y 0m" reads as broken rather than "brand new" — fall
  // back to a day count for anyone hired inside the current month.
  if (y === 0 && m === 0) {
    const days = tenureDays(startDate, exitDate);
    return days <= 1 ? "1 day" : `${days} days`;
  }
  return `${y}y ${m}m`;
}

/** "1 yr" for 0 or 1 year, "N yrs" for 2+ — a work-anniversary badge/tenure
 * count reads oddly as "1 yrs" or "0 yrs" otherwise. Shared so Anniversaries,
 * the Dashboard's mini anniversary card and Profile all pluralize the same
 * way. */
export function formatYears(years: number): string {
  return `${years} yr${years < 2 ? "" : "s"}`;
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return parseCalendarDate(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const REFERENCE_NOW = new Date();

// Everything below is a pure function of the employee list the caller passes
// in — none of it reads a module-level array anymore. The list itself comes
// from the API via useEmployees() (@/data/employee-store), so every page
// that used to call e.g. metrics() with no arguments now calls
// metrics(employees) with whatever that hook returned.

export function metrics(employees: Employee[]) {
  const active = employees.filter((e) => e.status === "Active");
  const inactive = employees.filter((e) => e.status !== "Active");
  const oneYearAgo = new Date(REFERENCE_NOW);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const newHires = employees.filter((e) => parseCalendarDate(e.startDate) >= oneYearAgo);
  const exits = employees.filter((e) => e.exitDate && parseCalendarDate(e.exitDate) >= oneYearAgo);
  return {
    active: active.length,
    inactive: inactive.length,
    newHires: newHires.length,
    exits: exits.length,
    eastwood: active.filter((e) => e.office === "PH Eastwood").length,
    medellin: active.filter((e) => e.office === "CO Medellin").length,
    newHireList: newHires.sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}

export function officeDistribution(employees: Employee[]) {
  return OFFICES.map((office) => ({
    office,
    active: employees.filter((e) => e.office === office && e.status === "Active").length,
    inactive: employees.filter((e) => e.office === office && e.status !== "Active").length,
  }));
}

export function statusDistribution(employees: Employee[]) {
  return STATUSES.map((status) => ({
    status,
    count: employees.filter((e) => e.status === status).length,
  }));
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function upcomingBirthdays(employees: Employee[]) {
  return employees
    .filter((e) => e.status === "Active" && e.birthday)
    .flatMap((e) => {
      const d = parseCalendarDate(e.birthday);
      // Skip rows with an unparsable or missing birthday (e.g. blank cells from
      // an Excel import) instead of producing a NaN month that crashes the page.
      if (Number.isNaN(d.getTime())) return [];
      return [
        {
          ...e,
          monthIndex: d.getMonth(),
          day: d.getDate(),
          monthName: MONTH_NAMES[d.getMonth()]!,
          birthYear: d.getFullYear(),
        },
      ];
    })
    .sort((a, b) => a.monthIndex - b.monthIndex || a.day - b.day);
}

export function anniversaries(employees: Employee[]) {
  return employees
    .filter((e) => e.status === "Active" && e.startDate)
    .flatMap((e) => {
      const d = parseCalendarDate(e.startDate);
      if (Number.isNaN(d.getTime())) return [];
      const years = REFERENCE_NOW.getFullYear() - d.getFullYear();
      return [
        {
          ...e,
          monthIndex: d.getMonth(),
          day: d.getDate(),
          monthName: MONTH_NAMES[d.getMonth()]!,
          years: Math.max(years, 0),
        },
      ];
    })
    .sort((a, b) => a.monthIndex - b.monthIndex || a.day - b.day);
}

// --- Month arrangement (Anniversaries + Birthdays pages) ---------------------
// How the month cards are ordered/limited:
//   calendar       January -> December (the original, default order)
//   current-onward only the current month through December
//   current-first  the current month through December, then the months that
//                  have already passed (January ...) underneath
export type MonthArrangement = "calendar" | "current-onward" | "current-first";

export const MONTH_ARRANGEMENTS: MonthArrangement[] = [
  "calendar",
  "current-onward",
  "current-first",
];

export const MONTH_ARRANGEMENT_LABELS: Record<MonthArrangement, string> = {
  calendar: "January \u2192 December",
  "current-onward": "Current & remaining months",
  "current-first": "Current month first",
};

/** Month indexes (0-11) in display order for an arrangement. `past` marks the
 * months that already went by this year and are shown below the rest. */
export function arrangedMonths(
  arrangement: MonthArrangement,
  now: Date = new Date(),
): { monthIndex: number; past: boolean }[] {
  const current = now.getMonth();
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  if (arrangement === "calendar") {
    return range(0, 11).map((monthIndex) => ({ monthIndex, past: false }));
  }
  const upcoming = range(current, 11).map((monthIndex) => ({ monthIndex, past: false }));
  if (arrangement === "current-onward") return upcoming;
  return [...upcoming, ...range(0, current - 1).map((monthIndex) => ({ monthIndex, past: true }))];
}

// --- Recurring-date windows (birthdays, anniversaries) -----------------
// Shared by the Dashboard's "recent" cards and the dedicated Anniversaries/
// Birthdays pages' own time filters — one implementation instead of three
// copies drifting apart.

/** How many days ago a recurring month/day (birthday, anniversary) last
 * occurred — rolls back a year when this year's date hasn't happened yet, so
 * e.g. a Jan 5 birthday checked in December still reads as "~330 days ago"
 * rather than a negative, still-upcoming number. */
export function daysSinceLastOccurrence(monthIndex: number, day: number): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let occurrence = new Date(now.getFullYear(), monthIndex, day);
  if (occurrence > startOfToday) occurrence = new Date(now.getFullYear() - 1, monthIndex, day);
  return Math.round((startOfToday.getTime() - occurrence.getTime()) / 86_400_000);
}

/** The mirror image of daysSinceLastOccurrence: how many days from today
 * until this month/day's *next* occurrence, rolling forward a year if this
 * year's date has already passed. */
export function daysUntilNextOccurrence(monthIndex: number, day: number): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let occurrence = new Date(now.getFullYear(), monthIndex, day);
  if (occurrence < startOfToday) occurrence = new Date(now.getFullYear() + 1, monthIndex, day);
  return Math.round((occurrence.getTime() - startOfToday.getTime()) / 86_400_000);
}

export type MilestoneTimeFilter =
  "all" | "this-month" | "last-7" | "next-7" | "last-30" | "next-30";

export const MILESTONE_TIME_FILTER_LABELS: Record<MilestoneTimeFilter, string> = {
  all: "All year",
  "this-month": "This month",
  "last-7": "Last 7 days",
  "next-7": "Next 7 days",
  "last-30": "Last 30 days",
  "next-30": "Next 30 days",
};

/** Backs the time-window Select on the Anniversaries/Birthdays pages. */
export function matchesMilestoneTimeFilter(
  monthIndex: number,
  day: number,
  filter: MilestoneTimeFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "this-month":
      return monthIndex === REFERENCE_NOW.getMonth();
    case "last-7":
      return daysSinceLastOccurrence(monthIndex, day) <= 7;
    case "next-7":
      return daysUntilNextOccurrence(monthIndex, day) <= 7;
    case "last-30":
      return daysSinceLastOccurrence(monthIndex, day) <= 30;
    case "next-30":
      return daysUntilNextOccurrence(monthIndex, day) <= 30;
  }
}

export function departmentDistribution(employees: Employee[]) {
  return DEPARTMENTS.map((department) => ({
    department,
    active: employees.filter((e) => e.department === department && e.status === "Active").length,
    inactive: employees.filter((e) => e.department === department && e.status !== "Active").length,
  }));
}

function monthsBetween(startDate: string, end: Date) {
  const start = parseCalendarDate(startDate);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(months, 0);
}

export function tenureDistribution(employees: Employee[]) {
  const buckets = [
    { band: "0-1 yr", min: 0, max: 12 },
    { band: "1-3 yrs", min: 12, max: 36 },
    { band: "3-5 yrs", min: 36, max: 60 },
    { band: "5-8 yrs", min: 60, max: 96 },
    { band: "8+ yrs", min: 96, max: Infinity },
  ];
  return buckets.map((b) => ({
    band: b.band,
    employees: employees.filter((e) => {
      if (e.status !== "Active") return false;
      const m = monthsBetween(e.startDate, REFERENCE_NOW);
      return m >= b.min && m < b.max;
    }).length,
  }));
}

// --- Date-range-aware trend charts ------------------------------------
// All three trend functions below (monthlyHiringTrend, headcountGrowth,
// headcountTrend) take the same optional `range` — an explicit {from, to}
// calendar window — so the Analytics page's date filter genuinely changes
// what these charts compute, not just how many trailing months of a fixed
// "now" they show. Omitting `range` keeps each function's original
// behavior (a fixed trailing window ending today), so existing callers
// (the Dashboard's HeadcountTrendChart) are unaffected.

export type DateRange = { from: Date; to: Date };

function defaultTrendRange(monthsBack: number): DateRange {
  const to = REFERENCE_NOW;
  const from = new Date(to.getFullYear(), to.getMonth() - (monthsBack - 1), 1);
  return { from, to };
}

/** Every {year, month} pair from `from`'s month through `to`'s month,
 * inclusive — the actual calendar range, not a count of trailing months, so
 * a custom From/To selection (not just "last N months") produces the right
 * set of columns. */
function monthsInRange({ from, to }: DateRange): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();
  const endYear = to.getFullYear();
  const endMonth = to.getMonth();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push({ year, month });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]!.slice(0, 3)} ${String(year).slice(2)}`;
}

/** Active headcount at the end of a given {year, month}. Shared by
 * headcountGrowth and headcountTrend below — the two only ever differed by
 * default window length, not by what they actually compute. */
function activeHeadcountAtMonthEnd(employees: Employee[], year: number, month: number): number {
  const end = new Date(year, month + 1, 0);
  return employees.filter((e) => {
    if (parseCalendarDate(e.startDate) > end) return false;
    if (e.exitDate && parseCalendarDate(e.exitDate) <= end) return false;
    return true;
  }).length;
}

/** Hires vs exits per month — defaults to the trailing 12 months. */
export function monthlyHiringTrend(employees: Employee[], range?: DateRange) {
  return monthsInRange(range ?? defaultTrendRange(12)).map(({ year, month }) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return {
      month: monthLabel(year, month),
      hires: employees.filter((e) => e.startDate.startsWith(key)).length,
      exits: employees.filter((e) => e.exitDate?.startsWith(key)).length,
    };
  });
}

/** Cumulative active headcount at the end of each month — defaults to the
 * trailing 12 months. */
export function headcountGrowth(employees: Employee[], range?: DateRange) {
  return monthsInRange(range ?? defaultTrendRange(12)).map(({ year, month }) => ({
    month: monthLabel(year, month),
    headcount: activeHeadcountAtMonthEnd(employees, year, month),
  }));
}

/** Same computation as headcountGrowth, just a shorter default window (6
 * months) to match this chart's "rolling six-month" framing — previously
 * this returned entirely synthetic placeholder numbers rather than a real
 * headcount, which the date-range filter would otherwise have had nothing
 * genuine to apply to. */
export function headcountTrend(employees: Employee[], range?: DateRange) {
  return monthsInRange(range ?? defaultTrendRange(6)).map(({ year, month }) => ({
    month: monthLabel(year, month),
    headcount: activeHeadcountAtMonthEnd(employees, year, month),
  }));
}
