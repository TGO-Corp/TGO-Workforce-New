// The Viewer role's Dashboard: their OWN overview instead of the company-wide
// numbers — personal metric cards and charts built from just their own
// Employee Directory row (and their own awards, when the matrix lets them see
// the Awards module). Nothing here aggregates anyone else's data.
//
// An account is tied to its Employee row by exact name match, the same
// best-available link the Profile page uses (see normalizeName in
// src/routes/profile.tsx) — plenty of accounts exist purely to run the portal
// and were never hired, hence the "not linked" empty state below.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Cake, CalendarClock, CalendarHeart, Trophy, UserRound } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { BandedCardHeader } from "@/components/banded-card-header";
import { MetricCard } from "@/components/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useAwards } from "@/data/award-store";
import { useEmployees } from "@/data/employee-store";
import {
  daysUntilNextOccurrence,
  formatDate,
  parseCalendarDate,
  tenure,
  tenureDays,
  type Employee,
} from "@/data/employees";
import { canViewAwards } from "@/lib/permissions";
import { useCurrentAccount } from "@/lib/session";

const SERVICE_MILESTONE_YEARS = [1, 2, 3, 5, 10, 15, 20, 25];

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function daysUntilDate(target: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function inDays(days: number): string {
  if (days === 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

const yearConfig = {
  elapsed: { label: "Completed", color: "var(--chart-1)" },
  remaining: { label: "To go", color: "var(--chart-3)" },
} satisfies ChartConfig;

const countdownConfig = {
  days: { label: "Days away", color: "var(--chart-2)" },
} satisfies ChartConfig;

const awardsConfig = {
  awards: { label: "Awards", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function MyOverview() {
  const { data: account, isLoading } = useCurrentAccount();
  const employees = useEmployees();
  const mounted = useMounted();
  const showAwards = canViewAwards(account?.permissions);
  const allAwards = useAwards(showAwards);

  const nameCandidates = [
    account?.display_name,
    [account?.first_name, account?.last_name].filter(Boolean).join(" "),
  ].filter((name): name is string => !!name?.trim());
  const me: Employee | undefined = employees.find((e) =>
    nameCandidates.some((candidate) => normalizeName(candidate) === normalizeName(e.name)),
  );

  const greetingName = account?.first_name || account?.display_name || "there";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Overview" description="Loading your overview…" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Welcome, ${greetingName}`}
          description="Your personal overview of your time with Torero Global Outsourcing."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserRound className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">We couldn't find your employee record</p>
              <p className="text-sm text-muted-foreground">
                Your account isn't matched to a row in the Employee Directory yet, so there's
                nothing personal to show. Make sure your account name matches your name on file, or
                ask HR to check it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const start = parseCalendarDate(me.startDate);
  const isActive = me.status === "Active";
  const totalDays = tenureDays(me.startDate, me.exitDate);
  const daysToAnniversary = daysUntilNextOccurrence(start.getMonth(), start.getDate());
  // Whole years of service completed so far.
  const completedYears = Math.floor(totalDays / 365.25);
  const nextAnniversaryYear = completedYears + 1;
  // How far through the current year of service they are — whole-year slices,
  // so a day-one hire starts at 0% and a hire two days before their
  // anniversary sits near 100%.
  const yearElapsed = Math.min(365, Math.max(0, 365 - daysToAnniversary));
  const yearProgress = [
    { slice: "elapsed", days: yearElapsed },
    { slice: "remaining", days: 365 - yearElapsed },
  ];

  const birthday = me.birthday ? parseCalendarDate(me.birthday) : null;
  const birthdayValid = birthday !== null && !Number.isNaN(birthday.getTime());
  const daysToBirthday = birthdayValid
    ? daysUntilNextOccurrence(birthday.getMonth(), birthday.getDate())
    : null;

  const nextServiceYears = SERVICE_MILESTONE_YEARS.find((y) => y > completedYears);
  const daysToServiceMilestone =
    nextServiceYears !== undefined
      ? daysUntilDate(
          new Date(start.getFullYear() + nextServiceYears, start.getMonth(), start.getDate()),
        )
      : null;

  const countdowns = [
    { label: `${nextAnniversaryYear}-yr anniversary`, days: daysToAnniversary },
    ...(daysToBirthday !== null ? [{ label: "Birthday", days: daysToBirthday }] : []),
    ...(daysToServiceMilestone !== null &&
    nextServiceYears !== undefined &&
    nextServiceYears !== nextAnniversaryYear
      ? [{ label: `${nextServiceYears}-yr milestone`, days: daysToServiceMilestone }]
      : []),
  ].filter((c) => c.days >= 0);

  const myAwards = showAwards ? allAwards.filter((a) => a.employeeId === me.id) : [];
  const awardsByYear = Object.entries(
    myAwards.reduce<Record<string, number>>((acc, award) => {
      const year = String(parseCalendarDate(award.awardedDate).getFullYear());
      acc[year] = (acc[year] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, awards]) => ({ year, awards }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${greetingName}`}
        description="Your personal overview — your time with Torero Global Outsourcing at a glance."
      />

      <Card className="overflow-hidden">
        <BandedCardHeader seed="my-overview-profile">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{me.name}</CardTitle>
              <CardDescription>
                {[me.position, me.department].filter(Boolean).join(" · ") || "Employee"}
              </CardDescription>
            </div>
            <Badge variant={isActive ? "default" : "secondary"}>{me.status}</Badge>
          </div>
        </BandedCardHeader>
        <CardContent className="grid gap-4 pt-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Office</p>
            <p className="font-medium">{me.office}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Level</p>
            <p className="font-medium">{me.level || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Start date</p>
            <p className="font-medium">{formatDate(me.startDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Full profile</p>
            <Link to="/profile" className="font-medium text-primary hover:underline">
              Open My Profile
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Time with TGO"
          value={tenure(me.startDate, me.exitDate)}
          hint={`Since ${formatDate(me.startDate)}`}
          icon={CalendarClock}
        />
        <MetricCard
          title="Next Anniversary"
          value={inDays(daysToAnniversary)}
          hint={`Year ${nextAnniversaryYear} milestone`}
          icon={CalendarHeart}
        />
        <MetricCard
          title="Next Birthday"
          value={daysToBirthday === null ? "—" : inDays(daysToBirthday)}
          hint={daysToBirthday === null ? "No birthday on file" : "Until your birthday"}
          icon={Cake}
        />
        {showAwards ? (
          <MetricCard
            title="My Awards"
            value={myAwards.length}
            hint={myAwards.length === 1 ? "Recognition received" : "Recognitions received"}
            icon={Trophy}
          />
        ) : (
          <MetricCard
            title="Days with TGO"
            value={totalDays}
            hint={`${completedYears} full year${completedYears === 1 ? "" : "s"} of service`}
            icon={Trophy}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <BandedCardHeader seed="my-overview-year">
            <CardTitle>My Year of Service</CardTitle>
            <CardDescription>
              Progress toward your year {nextAnniversaryYear} anniversary
            </CardDescription>
          </BandedCardHeader>
          <CardContent className="pt-6">
            {!mounted ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <div className="relative">
                <ChartContainer config={yearConfig} className="mx-auto h-[260px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="slice" />} />
                    <Pie
                      data={yearProgress}
                      dataKey="days"
                      nameKey="slice"
                      innerRadius={70}
                      outerRadius={100}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {yearProgress.map((entry) => (
                        <Cell key={entry.slice} fill={`var(--color-${entry.slice})`} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-3xl font-semibold">{Math.round((yearElapsed / 365) * 100)}%</p>
                  <p className="text-xs text-muted-foreground">{inDays(daysToAnniversary)} to go</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <BandedCardHeader seed="my-overview-countdown">
            <CardTitle>My Upcoming Dates</CardTitle>
            <CardDescription>Days until your next milestones</CardDescription>
          </BandedCardHeader>
          <CardContent className="pt-6">
            {!mounted ? (
              <Skeleton className="h-[260px] w-full" />
            ) : countdowns.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No upcoming dates to show.
              </p>
            ) : (
              <ChartContainer config={countdownConfig} className="h-[260px] w-full">
                <BarChart data={countdowns} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="days" fill="var(--color-days)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {showAwards && (
          <Card className="overflow-hidden lg:col-span-2">
            <BandedCardHeader seed="my-overview-awards">
              <CardTitle>My Recognition</CardTitle>
              <CardDescription>Awards you've received, by year</CardDescription>
            </BandedCardHeader>
            <CardContent className="pt-6">
              {!mounted ? (
                <Skeleton className="h-[220px] w-full" />
              ) : awardsByYear.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No awards yet — they'll show up here once you're recognized.
                </p>
              ) : (
                <ChartContainer config={awardsConfig} className="h-[220px] w-full">
                  <BarChart data={awardsByYear}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="awards" fill="var(--color-awards)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
