import { useChartMotion } from "@/hooks/use-interface-motion";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileSpreadsheet, FileText, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DepartmentDistributionChart,
  HeadcountGrowthChart,
  HeadcountTrendChart,
  MonthlyHiringTrendChart,
  OfficeDistributionChart,
  StatusDistributionChart,
  TenureDistributionChart,
} from "@/components/workforce-charts";
import {
  exportAnalyticsPdf,
  exportAnalyticsXlsx,
  type AnalyticsExportData,
} from "@/lib/analytics-export";
import {
  DEPARTMENTS,
  OFFICES,
  STATUSES,
  departmentDistribution,
  headcountGrowth,
  headcountTrend,
  monthlyHiringTrend,
  officeDistribution,
  parseCalendarDate,
  statusDistribution,
  tenureDistribution,
  type DateRange,
} from "@/data/employees";
import { useEmployees } from "@/data/employee-store";
import { computeStatus, type NewHire, type OnboardingStatus } from "@/data/new-hire-api";
import { useNewHires } from "@/data/new-hire-store";
import {
  OFFICES as VIOLATION_OFFICES,
  VIOLATION_TYPES,
  EMAIL_STATUSES,
  type EmailStatus,
  type ViolationRecord,
} from "@/data/violation-api";
import { useViolationsQuery } from "@/data/violation-store";
import { useAwards } from "@/data/award-store";
import type { Award } from "@/data/award-api";
import {
  HMO_ENROLLMENT_STATUSES,
  HMO_MEMBER_STATUSES,
  type HmoMember,
  type HmoMemberStatus,
} from "@/data/hmo-api";
import { useHmoMembersQuery } from "@/data/hmo-store";
import { useFeedbackQuery } from "@/data/feedback-store";
import type { Feedback, FeedbackStatus, FeedbackType } from "@/data/feedback-api";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";
import { getEffectiveRole, isFullAccessRole } from "@/lib/permissions";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Charts covering hiring trend, headcount growth, onboarding completion and attendance violations across every module.",
      },
      { property: "og:title", content: "Analytics — Torero Global Outsourcing HR Operations" },
      {
        property: "og:description",
        content:
          "Cross-module visual breakdown of headcount, onboarding progress and attendance violations.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const checklistConfig = {
  count: { label: "New hires" },
} satisfies ChartConfig;

const CHECKLIST_STEPS: { key: keyof NewHire; label: string }[] = [
  { key: "joDiscussion", label: "JO Discussion" },
  { key: "confirmationSigned", label: "Confirmation Signed" },
  { key: "welcomeEmailSent", label: "Welcome Email Sent" },
  { key: "newHireInfo", label: "New Hire Info" },
  { key: "idPhoto", label: "ID Photo" },
  { key: "credentialsCreated", label: "Credentials Created" },
  { key: "onboardingDay", label: "Onboarding Day" },
];

const ONBOARDING_STATUSES: OnboardingStatus[] = ["Not Started", "In Progress", "Complete"];

/** "YYYY-MM-DD" from local date parts — not toISOString(), which converts to
 * UTC first and can drift the date by one depending on the viewer's
 * timezone (same class of bug @/data/employees' parseCalendarDate exists to
 * avoid). Only used to seed the date inputs' defaults; every value the user
 * actually picks comes back through the same "YYYY-MM-DD" shape natively. */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const violationTypeConfig = {
  count: { label: "Violations", color: "var(--chart-1)" },
} satisfies ChartConfig;

const violationOfficeConfig = {
  PH: { label: "PH", color: "var(--chart-1)" },
  CO: { label: "CO", color: "var(--chart-2)" },
} satisfies ChartConfig;

const MONTH_TREND_WINDOW = 6;

/** Trailing N calendar months (oldest first), each as a "YYYY-MM" match key
 * plus a short display label — shared by the Attendance and Recognition
 * tabs' own trend charts below, same bucketing idea as
 * @/data/employees' monthLabel/monthsInRange but scoped locally here since
 * violations and awards aren't Employee-domain data. */
function trailingMonths(count: number): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    out.push({ key, label });
  }
  return out;
}

const violationTrendConfig = {
  count: { label: "Violations", color: "var(--chart-1)" },
} satisfies ChartConfig;

const violationStatusConfig = {
  count: { label: "Records" },
} satisfies ChartConfig;

const awardsTrendConfig = {
  count: { label: "Awards given", color: "var(--chart-3)" },
} satisfies ChartConfig;

const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug",
  improvement: "Improvement",
};

const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: "Pending",
  working_on_it: "Working On It",
  resolved: "Resolved",
  implemented: "Implemented",
};

const feedbackTypeConfig = {
  count: { label: "Reports" },
  Bug: { label: "Bug", color: "var(--chart-4)" },
  Improvement: { label: "Improvement", color: "var(--chart-2)" },
} satisfies ChartConfig;

const feedbackStatusConfig = {
  count: { label: "Cards", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Onboarding tab's one chart, now filtered by whichever checklist-completion
 * statuses are checked in the tab's own filter bar — takes `hires` as a prop
 * (rather than calling useNewHires() itself) so the caller controls scope. */
function OnboardingCompletionChart({ hires }: { hires: NewHire[] }) {
  const animate = useChartMotion();
  const data = CHECKLIST_STEPS.map((field) => ({
    step: field.label,
    count: hires.filter((h) => h[field.key]).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding Checklist Completion</CardTitle>
        <CardDescription>How many new hires have completed each step</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={hires.length === 0}
          config={checklistConfig}
          className="h-[280px] w-full"
        >
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="step" width={140} tick={{ fontSize: 12 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={300}
              dataKey="count"
              fill="var(--chart-1)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const onboardingStatusConfig = {
  count: { label: "New hires" },
} satisfies ChartConfig;

// Not folded into onboardingStatusConfig's own `color` fields — ChartContainer
// turns each config key into a `--color-<key>` CSS custom property, and a
// custom property name can't contain a space (which "Not Started"/"In
// Progress" both do). A plain lookup sidesteps that entirely.
const ONBOARDING_STATUS_COLORS: Record<OnboardingStatus, string> = {
  "Not Started": "var(--chart-5)",
  "In Progress": "var(--chart-2)",
  Complete: "var(--chart-1)",
};

/** Onboarding tab's second chart — how many tracked new hires currently sit
 * in each checklist-completion bucket, same three buckets as the tab's own
 * filter (@/data/new-hire-api's computeStatus). Complements
 * OnboardingCompletionChart above (which step, not which hire, is behind). */
function OnboardingStatusChart({ hires }: { hires: NewHire[] }) {
  const animate = useChartMotion();
  const data = ONBOARDING_STATUSES.map((status) => ({
    status,
    count: hires.filter((h) => computeStatus(h) === status).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding Status Breakdown</CardTitle>
        <CardDescription>New hires by checklist-completion status</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <ChartContainer
          config={onboardingStatusConfig}
          className="mx-auto h-[280px] w-full max-w-[320px]"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
            <Pie
              isAnimationActive={animate}
              animationDuration={300}
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={55}
              outerRadius={95}
            >
              {data.map((row) => (
                <Cell key={row.status} fill={ONBOARDING_STATUS_COLORS[row.status]} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="status" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const hmoEnrollmentStatusConfig = {
  count: { label: "Members", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** HMO tab's first chart — every member (Principal + Dependent) by
 * enrollment-workflow stage, per the SOP's own "where in the enrollment
 * workflow" framing (@/data/hmo-api's HmoEnrollmentStatus) — a horizontal bar
 * since there are 10 possible stages, too many to read comfortably as a pie. */
function HmoEnrollmentStatusChart({ members }: { members: HmoMember[] }) {
  const animate = useChartMotion();
  const data = HMO_ENROLLMENT_STATUSES.map((status) => ({
    status,
    count: members.filter((m) => m.enrollmentStatus === status).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>HMO Enrollment Status</CardTitle>
        <CardDescription>Members by enrollment-workflow stage</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={members.length === 0}
          config={hmoEnrollmentStatusConfig}
          className="h-[300px] w-full"
        >
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="status" width={150} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={300}
              dataKey="count"
              fill="var(--chart-1)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const hmoMemberStatusConfig = {
  count: { label: "Members" },
} satisfies ChartConfig;

// Same reasoning as ONBOARDING_STATUS_COLORS above — several HmoMemberStatus
// values contain spaces, which a `--color-<key>` CSS custom property can't.
const HMO_MEMBER_STATUS_COLORS: Record<HmoMemberStatus, string> = {
  "Not Yet Active": "var(--chart-5)",
  Active: "var(--chart-1)",
  Inactive: "var(--chart-3)",
  Suspended: "var(--chart-4)",
  Terminated: "var(--chart-2)",
};

/** HMO tab's second chart — whether the membership is currently usable
 * (@/data/hmo-api's HmoMemberStatus), separate from enrollment stage above,
 * per the SOP's own design rule that the two fields never conflate. */
function HmoMemberStatusChart({ members }: { members: HmoMember[] }) {
  const animate = useChartMotion();
  const data = HMO_MEMBER_STATUSES.map((status) => ({
    status,
    count: members.filter((m) => m.memberStatus === status).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>HMO Member Status</CardTitle>
        <CardDescription>Whether the membership is currently usable</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <ChartContainer
          config={hmoMemberStatusConfig}
          className="mx-auto h-[280px] w-full max-w-[320px]"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
            <Pie
              isAnimationActive={animate}
              animationDuration={300}
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={55}
              outerRadius={95}
            >
              {data.map((row) => (
                <Cell key={row.status} fill={HMO_MEMBER_STATUS_COLORS[row.status]} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="status" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Attendance tab's two charts, computed client-side from the filtered
 * `violations` list passed in — previously these read a fixed backend
 * aggregate (GET /violation-analytics/overview) that had no filter params;
 * aggregating from the already-fetched raw records here instead means the
 * tab's Office/Type filters actually take effect with no backend change. */
function ViolationsByTypeChart({ violations }: { violations: ViolationRecord[] }) {
  const animate = useChartMotion();
  const counts = new Map<string, number>();
  for (const v of violations) {
    counts.set(v.violationTypeLabel, (counts.get(v.violationTypeLabel) ?? 0) + 1);
  }
  const rows = [...counts.entries()].map(([type, count]) => ({ type, count }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Violations by Type</CardTitle>
        <CardDescription>Attendance violation records by category</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={violations.length === 0}
          config={violationTypeConfig}
          className="h-[280px] w-full"
        >
          <BarChart accessibilityLayer data={rows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="type" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={300}
              dataKey="count"
              fill="var(--chart-1)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function ViolationsByOfficeChart({ violations }: { violations: ViolationRecord[] }) {
  const animate = useChartMotion();
  const counts = new Map<string, number>();
  for (const v of violations) {
    counts.set(v.office, (counts.get(v.office) ?? 0) + 1);
  }
  const rows = [...counts.entries()].map(([office, count]) => ({
    office,
    count,
    fill: `var(--color-${office})`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Violations by Office</CardTitle>
        <CardDescription>PH vs. CO split of open and closed violations</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <ChartContainer
          empty={violations.length === 0}
          config={violationOfficeConfig}
          className="h-[280px] w-full max-w-[320px]"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              isAnimationActive={animate}
              animationDuration={300}
              data={rows}
              dataKey="count"
              nameKey="office"
              innerRadius={50}
              outerRadius={90}
            >
              {rows.map((row) => (
                <Cell key={row.office} fill={row.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Where every violation currently sits in the prepare → approve → send
 * pipeline — a horizontal bar keeps all nine EmailStatus values readable
 * without rotating x-axis labels (several, like "Ready to Prepare", are too
 * long to fit upright). */
function ViolationsByStatusChart({ violations }: { violations: ViolationRecord[] }) {
  const animate = useChartMotion();
  const counts = new Map<EmailStatus, number>();
  for (const v of violations) {
    counts.set(v.emailStatus, (counts.get(v.emailStatus) ?? 0) + 1);
  }
  const data = EMAIL_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Violations by Status</CardTitle>
        <CardDescription>
          Where records sit in the prepare → approve → send pipeline
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={violations.length === 0}
          config={violationStatusConfig}
          className="h-[300px] w-full"
        >
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} fontSize={12} />
            <YAxis type="category" dataKey="status" width={110} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={300}
              dataKey="count"
              fill="var(--chart-1)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Violation records opened per month, trailing six months — the Attendance
 * tab's own volume-over-time view (separate from Workforce's headcount
 * trend, which this tab doesn't share a filterable dimension with). */
function ViolationsMonthlyTrendChart({ violations }: { violations: ViolationRecord[] }) {
  const animate = useChartMotion();
  const months = trailingMonths(MONTH_TREND_WINDOW);
  const data = months.map(({ key, label }) => ({
    month: label,
    count: violations.filter((v) => v.violationDate.startsWith(key)).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Violations Trend</CardTitle>
        <CardDescription>
          Violation records logged per month, last {MONTH_TREND_WINDOW} months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={violations.length === 0}
          config={violationTrendConfig}
          className="h-[280px] w-full"
        >
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={300}
              dataKey="count"
              fill="var(--chart-1)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Recognition tab's trend chart — awards given per month, trailing six
 * months. Unfiltered (this tab has no filter bar — see AnalyticsPage), same
 * as the other two Recognition charts below. */
function AwardsMonthlyTrendChart({ awards }: { awards: Award[] }) {
  const animate = useChartMotion();
  const months = trailingMonths(MONTH_TREND_WINDOW);
  const data = months.map(({ key, label }) => ({
    month: label,
    count: awards.filter((a) => a.awardedDate.startsWith(key)).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Awards Given Per Month</CardTitle>
        <CardDescription>
          Recognition given company-wide, last {MONTH_TREND_WINDOW} months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={awards.length === 0}
          config={awardsTrendConfig}
          className="h-[280px] w-full"
        >
          <LineChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              isAnimationActive={animate}
              animationDuration={300}
              type="monotone"
              dataKey="count"
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function FeedbackByTypeChart({ feedback }: { feedback: Feedback[] }) {
  const animate = useChartMotion();
  const data = (["bug", "improvement"] as const).map((type) => ({
    type: FEEDBACK_TYPE_LABELS[type],
    count: feedback.filter((f) => f.type === type).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback by Type</CardTitle>
        <CardDescription>Bug reports vs. improvement suggestions</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <ChartContainer
          config={feedbackTypeConfig}
          className="mx-auto h-[280px] w-full max-w-[320px]"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="type" />} />
            <Pie
              isAnimationActive={animate}
              animationDuration={300}
              data={data}
              dataKey="count"
              nameKey="type"
              innerRadius={55}
              outerRadius={95}
            >
              {data.map((row) => (
                <Cell key={row.type} fill={`var(--color-${row.type})`} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="type" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function FeedbackByStatusChart({ feedback }: { feedback: Feedback[] }) {
  const animate = useChartMotion();
  const data = (["pending", "working_on_it", "resolved", "implemented"] as const).map((status) => ({
    status: FEEDBACK_STATUS_LABELS[status],
    count: feedback.filter((f) => f.status === status).length,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback by Status</CardTitle>
        <CardDescription>Where every card sits on the Feedback board</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          empty={feedback.length === 0}
          config={feedbackStatusConfig}
          className="h-[280px] w-full"
        >
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="status" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              isAnimationActive={animate}
              animationDuration={300}
              dataKey="count"
              fill="var(--chart-1)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function AnalyticsPage() {
  const employees = useEmployees();
  const { data: account, isLoading: accountLoading } = useCurrentAccount();
  const isAdmin = isFullAccessRole(getEffectiveRole(account));

  const allHires = useNewHires(isAdmin);
  const { data: violationsPage } = useViolationsQuery({}, 0, 500, isAdmin);
  const allViolations = violationsPage?.items ?? [];
  const awards = useAwards(isAdmin);
  const { data: feedbackData } = useFeedbackQuery();
  const feedback = feedbackData ?? [];
  const { data: hmoMembersData } = useHmoMembersQuery(isAdmin);
  const allHmoMembers = hmoMembersData ?? [];

  // Each tab keeps its own filter state — the three tabs don't share a
  // filterable dimension in common (violations don't have a department,
  // new hires don't have an office), so one shared bar would just show
  // controls that do nothing on two of the three tabs.
  const [workforceOffice, setWorkforceOffice] = useState<string[]>([]);
  const [workforceDepartment, setWorkforceDepartment] = useState<string[]>([]);
  const [workforceStatus, setWorkforceStatus] = useState<string[]>([]);
  // The trend charts (Monthly Hiring Trend, Headcount Growth, Headcount
  // Trend) plot a span of months, not a single filterable value — a real
  // calendar From/To, defaulting to the trailing 12 months, so the window
  // they show is a genuine user-controlled range rather than a fixed "last N
  // months from today".
  const [trendFrom, setTrendFrom] = useState(() =>
    toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)),
  );
  const [trendTo, setTrendTo] = useState(() => toDateInputValue(new Date()));
  const [onboardingStatus, setOnboardingStatus] = useState<string[]>([]);
  const [attendanceOffice, setAttendanceOffice] = useState<string[]>([]);
  const [attendanceType, setAttendanceType] = useState<string[]>([]);
  const [hmoMemberType, setHmoMemberType] = useState<string[]>([]);
  const [hmoEnrollmentStatus, setHmoEnrollmentStatus] = useState<string[]>([]);

  // "YYYY-MM-DD" strings compare correctly with plain <=, no Date parsing
  // needed just to validate ordering.
  const trendRangeValid = trendFrom <= trendTo;
  const trendRange: DateRange | undefined = trendRangeValid
    ? { from: parseCalendarDate(trendFrom), to: parseCalendarDate(trendTo) }
    : undefined;

  const filteredEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          (workforceOffice.length === 0 || workforceOffice.includes(e.office)) &&
          (workforceDepartment.length === 0 || workforceDepartment.includes(e.department)) &&
          (workforceStatus.length === 0 || workforceStatus.includes(e.status)),
      ),
    [employees, workforceOffice, workforceDepartment, workforceStatus],
  );

  const filteredHires = useMemo(
    () =>
      onboardingStatus.length === 0
        ? allHires
        : allHires.filter((h) => onboardingStatus.includes(computeStatus(h))),
    [allHires, onboardingStatus],
  );

  const filteredViolations = useMemo(
    () =>
      allViolations.filter(
        (v) =>
          (attendanceOffice.length === 0 || attendanceOffice.includes(v.office)) &&
          (attendanceType.length === 0 || attendanceType.includes(v.violationTypeLabel)),
      ),
    [allViolations, attendanceOffice, attendanceType],
  );

  const filteredHmoMembers = useMemo(
    () =>
      allHmoMembers.filter(
        (m) =>
          (hmoMemberType.length === 0 || hmoMemberType.includes(m.memberType)) &&
          (hmoEnrollmentStatus.length === 0 || hmoEnrollmentStatus.includes(m.enrollmentStatus)),
      ),
    [allHmoMembers, hmoMemberType, hmoEnrollmentStatus],
  );

  const [exporting, setExporting] = useState(false);

  function buildExportData(): AnalyticsExportData {
    const filterLines: string[] = [];
    if (workforceOffice.length)
      filterLines.push(`Workforce · Office: ${workforceOffice.join(", ")}`);
    if (workforceDepartment.length)
      filterLines.push(`Workforce · Department: ${workforceDepartment.join(", ")}`);
    if (workforceStatus.length)
      filterLines.push(`Workforce · Status: ${workforceStatus.join(", ")}`);
    filterLines.push(
      `Workforce · Trend charts date range: ${trendFrom} to ${trendTo}${trendRangeValid ? "" : " (invalid — showing default 12-month window instead)"}`,
    );
    if (onboardingStatus.length)
      filterLines.push(`Onboarding · Checklist status: ${onboardingStatus.join(", ")}`);
    if (attendanceOffice.length)
      filterLines.push(`Attendance · Office: ${attendanceOffice.join(", ")}`);
    if (attendanceType.length)
      filterLines.push(`Attendance · Violation type: ${attendanceType.join(", ")}`);
    if (hmoMemberType.length) filterLines.push(`HMO · Member type: ${hmoMemberType.join(", ")}`);
    if (hmoEnrollmentStatus.length)
      filterLines.push(`HMO · Enrollment status: ${hmoEnrollmentStatus.join(", ")}`);

    const active = filteredEmployees.filter((e) => e.status === "Active").length;
    const resigned = filteredEmployees.filter((e) => e.status === "Resigned").length;
    const terminated = filteredEmployees.filter((e) => e.status === "Terminated").length;

    const office = officeDistribution(filteredEmployees);
    const status = statusDistribution(filteredEmployees);
    const department = departmentDistribution(filteredEmployees);
    const tenure = tenureDistribution(filteredEmployees);
    const hiring = monthlyHiringTrend(filteredEmployees, trendRange);
    const growth = headcountGrowth(filteredEmployees, trendRange);
    const trend = headcountTrend(filteredEmployees, trendRange);

    const checklist = CHECKLIST_STEPS.map((field) => ({
      step: field.label,
      count: filteredHires.filter((h) => h[field.key]).length,
    }));

    const byTypeCounts = new Map<string, number>();
    for (const v of filteredViolations) {
      byTypeCounts.set(v.violationTypeLabel, (byTypeCounts.get(v.violationTypeLabel) ?? 0) + 1);
    }
    const byOfficeCounts = new Map<string, number>();
    for (const v of filteredViolations) {
      byOfficeCounts.set(v.office, (byOfficeCounts.get(v.office) ?? 0) + 1);
    }
    const byStatusCounts = new Map<EmailStatus, number>();
    for (const v of filteredViolations) {
      byStatusCounts.set(v.emailStatus, (byStatusCounts.get(v.emailStatus) ?? 0) + 1);
    }
    const violationMonths = trailingMonths(MONTH_TREND_WINDOW).map(({ key, label }) => ({
      month: label,
      count: filteredViolations.filter((v) => v.violationDate.startsWith(key)).length,
    }));

    const onboardingStatusRows = ONBOARDING_STATUSES.map((s) => ({
      status: s,
      count: filteredHires.filter((h) => computeStatus(h) === s).length,
    }));

    const awardMonths = trailingMonths(MONTH_TREND_WINDOW).map(({ key, label }) => ({
      month: label,
      count: awards.filter((a) => a.awardedDate.startsWith(key)).length,
    }));
    const feedbackByType = (["bug", "improvement"] as const).map((t) => ({
      type: FEEDBACK_TYPE_LABELS[t],
      count: feedback.filter((f) => f.type === t).length,
    }));
    const feedbackByStatus = (["pending", "working_on_it", "resolved", "implemented"] as const).map(
      (s) => ({
        status: FEEDBACK_STATUS_LABELS[s],
        count: feedback.filter((f) => f.status === s).length,
      }),
    );

    const hmoEnrollmentRows = HMO_ENROLLMENT_STATUSES.map((s) => ({
      status: s,
      count: filteredHmoMembers.filter((m) => m.enrollmentStatus === s).length,
    }));
    const hmoMemberStatusRows = HMO_MEMBER_STATUSES.map((s) => ({
      status: s,
      count: filteredHmoMembers.filter((m) => m.memberStatus === s).length,
    }));

    return {
      filterLines,
      summary: [
        { label: "Total Employees (filtered)", value: filteredEmployees.length },
        { label: "Active", value: active },
        { label: "Resigned", value: resigned },
        { label: "Terminated", value: terminated },
        { label: "New Hires Tracked (filtered)", value: filteredHires.length },
        { label: "Attendance Records (filtered)", value: filteredViolations.length },
        { label: "Awards Given (all-time)", value: awards.length },
        { label: "Feedback Cards (all-time)", value: feedback.length },
        { label: "HMO Members (filtered)", value: filteredHmoMembers.length },
        {
          label: "Active HMO Members (filtered)",
          value: filteredHmoMembers.filter((m) => m.memberStatus === "Active").length,
        },
      ],
      sections: [
        {
          title: "Office Distribution",
          columns: ["Office", "Active", "Inactive"],
          rows: office.map((r) => [r.office, r.active, r.inactive]),
        },
        {
          title: "Status Distribution",
          columns: ["Status", "Count"],
          rows: status.map((r) => [r.status, r.count]),
        },
        {
          title: "Department Distribution",
          columns: ["Department", "Active", "Inactive"],
          rows: department.map((r) => [r.department, r.active, r.inactive]),
        },
        {
          title: "Tenure Distribution",
          columns: ["Tenure Band", "Employees"],
          rows: tenure.map((r) => [r.band, r.employees]),
        },
        {
          title: "Monthly Hiring Trend",
          columns: ["Month", "Hires", "Exits"],
          rows: hiring.map((r) => [r.month, r.hires, r.exits]),
        },
        {
          title: "Headcount Growth",
          columns: ["Month", "Active Headcount"],
          rows: growth.map((r) => [r.month, r.headcount]),
        },
        {
          title: "Headcount Trend (6mo)",
          columns: ["Month", "Headcount"],
          rows: trend.map((r) => [r.month, r.headcount]),
        },
        {
          title: "Onboarding Checklist Completion",
          columns: ["Step", "New Hires Completed"],
          rows: checklist.map((r) => [r.step, r.count]),
        },
        {
          title: "Onboarding Status Breakdown",
          columns: ["Status", "New Hires"],
          rows: onboardingStatusRows.map((r) => [r.status, r.count]),
        },
        {
          title: "Violations by Type",
          columns: ["Violation Type", "Count"],
          rows: [...byTypeCounts.entries()],
        },
        {
          title: "Violations by Office",
          columns: ["Office", "Count"],
          rows: [...byOfficeCounts.entries()],
        },
        {
          title: "Violations by Status",
          columns: ["Status", "Count"],
          rows: [...byStatusCounts.entries()],
        },
        {
          title: "Monthly Violations Trend",
          columns: ["Month", "Violations"],
          rows: violationMonths.map((r) => [r.month, r.count]),
        },
        {
          title: "Awards Given Per Month",
          columns: ["Month", "Awards"],
          rows: awardMonths.map((r) => [r.month, r.count]),
        },
        {
          title: "Feedback by Type",
          columns: ["Type", "Count"],
          rows: feedbackByType.map((r) => [r.type, r.count]),
        },
        {
          title: "Feedback by Status",
          columns: ["Status", "Count"],
          rows: feedbackByStatus.map((r) => [r.status, r.count]),
        },
        {
          title: "HMO Enrollment Status",
          columns: ["Enrollment Status", "Members"],
          rows: hmoEnrollmentRows.map((r) => [r.status, r.count]),
        },
        {
          title: "HMO Member Status",
          columns: ["Member Status", "Members"],
          rows: hmoMemberStatusRows.map((r) => [r.status, r.count]),
        },
      ],
    };
  }

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const data = buildExportData();
      if (format === "xlsx") await exportAnalyticsXlsx(data);
      else await exportAnalyticsPdf(data);
      toast.success(`Analytics report exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // Analytics rolls up numbers across every module (Employee Directory,
  // Onboarding, Attendance) — no single module-siloed role should see the
  // full cross-module picture, only Admin. Same wall pattern as
  // user-management.tsx; the nav item is also hidden for non-admins (see
  // app-sidebar.tsx's adminOnly flag), this is the page's own enforcement of
  // that in case someone navigates here directly by URL.
  if (accountLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Cross-module reporting." />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Cross-module reporting." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Admins only</p>
              <p className="text-sm text-muted-foreground">
                Your account ({account ? ROLE_LABELS[account.role] : "signed out"}) doesn't have
                access to this page. Ask an existing admin if you need it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Hiring, onboarding progress and attendance analysis across every module."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export Report
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
        }
      />
      <Tabs defaultValue="workforce">
        <TabsList>
          <TabsTrigger value="workforce">Workforce</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="recognition">Recognition</TabsTrigger>
          <TabsTrigger value="hmo">HMO</TabsTrigger>
        </TabsList>

        <TabsContent value="workforce" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <MultiSelectFilter
              label="Office"
              selected={workforceOffice}
              onChange={setWorkforceOffice}
              options={[...OFFICES]}
            />
            <MultiSelectFilter
              label="Department"
              selected={workforceDepartment}
              onChange={setWorkforceDepartment}
              options={[...DEPARTMENTS]}
            />
            <MultiSelectFilter
              label="Status"
              selected={workforceStatus}
              onChange={setWorkforceStatus}
              options={[...STATUSES]}
            />
            <div className="flex items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="trend-from" className="text-xs text-muted-foreground">
                  Trend charts: from
                </Label>
                <Input
                  id="trend-from"
                  type="date"
                  value={trendFrom}
                  onChange={(e) => setTrendFrom(e.target.value)}
                  className="h-9 w-[150px]"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="trend-to" className="text-xs text-muted-foreground">
                  to
                </Label>
                <Input
                  id="trend-to"
                  type="date"
                  value={trendTo}
                  onChange={(e) => setTrendTo(e.target.value)}
                  className="h-9 w-[150px]"
                />
              </div>
            </div>
            {(workforceOffice.length > 0 ||
              workforceDepartment.length > 0 ||
              workforceStatus.length > 0) && (
              <span className="text-xs text-muted-foreground">
                Showing {filteredEmployees.length} of {employees.length} employees
              </span>
            )}
          </div>
          {!trendRangeValid && (
            <p className="text-xs text-destructive">
              "From" must be on or before "to" — the trend charts below are showing their default
              12-month window until this is fixed.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <MonthlyHiringTrendChart employees={filteredEmployees} range={trendRange} />
            <HeadcountGrowthChart employees={filteredEmployees} range={trendRange} />
            <DepartmentDistributionChart employees={filteredEmployees} />
            <TenureDistributionChart employees={filteredEmployees} />
            <OfficeDistributionChart employees={filteredEmployees} />
            <StatusDistributionChart employees={filteredEmployees} />
          </div>
          <HeadcountTrendChart employees={filteredEmployees} range={trendRange} />
        </TabsContent>

        <TabsContent value="onboarding" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Checklist status"
              selected={onboardingStatus}
              onChange={setOnboardingStatus}
              options={[...ONBOARDING_STATUSES]}
            />
            {onboardingStatus.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Showing {filteredHires.length} of {allHires.length} new hires
              </span>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <OnboardingCompletionChart hires={filteredHires} />
            <OnboardingStatusChart hires={filteredHires} />
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Office"
              selected={attendanceOffice}
              onChange={setAttendanceOffice}
              options={[...VIOLATION_OFFICES]}
            />
            <MultiSelectFilter
              label="Violation type"
              selected={attendanceType}
              onChange={setAttendanceType}
              options={[...VIOLATION_TYPES]}
            />
            {(attendanceOffice.length > 0 || attendanceType.length > 0) && (
              <span className="text-xs text-muted-foreground">
                Showing {filteredViolations.length} of {allViolations.length} records
              </span>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ViolationsByTypeChart violations={filteredViolations} />
            <ViolationsByOfficeChart violations={filteredViolations} />
            <ViolationsByStatusChart violations={filteredViolations} />
            <ViolationsMonthlyTrendChart violations={filteredViolations} />
          </div>
        </TabsContent>

        <TabsContent value="recognition" className="space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Company-wide Recognition &amp; Awards and Feedback board activity — unfiltered.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <AwardsMonthlyTrendChart awards={awards} />
            <FeedbackByTypeChart feedback={feedback} />
            <FeedbackByStatusChart feedback={feedback} />
          </div>
        </TabsContent>

        <TabsContent value="hmo" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter
              label="Member type"
              selected={hmoMemberType}
              onChange={setHmoMemberType}
              options={["Principal", "Dependent"]}
            />
            <MultiSelectFilter
              label="Enrollment status"
              selected={hmoEnrollmentStatus}
              onChange={setHmoEnrollmentStatus}
              options={[...HMO_ENROLLMENT_STATUSES]}
            />
            {(hmoMemberType.length > 0 || hmoEnrollmentStatus.length > 0) && (
              <span className="text-xs text-muted-foreground">
                Showing {filteredHmoMembers.length} of {allHmoMembers.length} HMO members
              </span>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <HmoEnrollmentStatusChart members={filteredHmoMembers} />
            <HmoMemberStatusChart members={filteredHmoMembers} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
