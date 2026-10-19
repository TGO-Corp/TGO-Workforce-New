// The Dashboard's row of milestone cards: recent New Hires, Anniversaries,
// Birthdays and Awards, with the shared "next / last 30 days" picker above the
// date-based ones. Each card is shown only when the page says so (permission
// plus the person's own Settings toggles). Keep these as separate scrollable
// cards so all four lists can be scanned together.

import { useState, type ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Award as AwardIcon, Cake, Trophy, UserPlus, ArrowUpRight } from "lucide-react";

import { EmployeeNameLink } from "@/components/employee-name-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Award } from "@/data/award-api";
import {
  formatDate,
  formatYears,
  MILESTONE_TIME_FILTER_LABELS,
  tenureDays,
  type Employee,
} from "@/data/employees";
import {
  DASHBOARD_MILESTONE_WINDOWS,
  RECENT_HIRE_DAYS,
  RECENT_MILESTONE_DAYS,
  SOON_THRESHOLD_DAYS,
  recentAnniversaries,
  recentAwards,
  recentBirthdays,
  type DashboardMilestoneWindow,
} from "@/lib/dashboard-data";

// These four panels stay together at the top of the dashboard.
function MilestoneHeader({
  count,
  loading,
  unavailable,
  children,
  ...props
}: ComponentProps<typeof CardHeader> & {
  count: number;
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <CardHeader
      className="min-h-[92px] justify-center border-b border-border/70 bg-card p-4 [&_svg]:shrink-0 [&_svg]:text-primary"
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">{children}</div>
        <span
          aria-label={
            loading
              ? "Loading record count"
              : unavailable
                ? "Record count unavailable"
                : `${count} records`
          }
          className="flex min-w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground"
        >
          {loading || unavailable ? "—" : count.toLocaleString()}
        </span>
      </div>
    </CardHeader>
  );
}

function MilestoneFooter({
  to,
  children,
}: {
  to: "/directory" | "/anniversaries" | "/birthdays" | "/awards";
  children: string;
}) {
  return (
    <div className="border-t border-border/70 bg-card px-4 py-3">
      <Link
        to={to}
        className="flex items-center justify-between gap-2 rounded-sm text-xs font-medium text-primary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function compactDate(date: string) {
  return formatDate(date).replace(/, \d{4}$/, "");
}

export function MilestoneCards({
  employees,
  awards,
  newHires,
  showNewHires,
  showAnniversaries,
  showBirthdays,
  showAwards,
  employeesLoading = false,
  employeesError = false,
  awardsLoading = false,
  awardsError = false,
}: {
  employees: Employee[];
  awards: Award[];
  /** Already-computed recent hires (the page needs them for other cards too). */
  newHires: Employee[];
  showNewHires: boolean;
  showAnniversaries: boolean;
  showBirthdays: boolean;
  showAwards: boolean;
  employeesLoading?: boolean;
  employeesError?: boolean;
  awardsLoading?: boolean;
  awardsError?: boolean;
}) {
  const [milestoneWindow, setMilestoneWindow] = useState<DashboardMilestoneWindow>("next-30");
  const isUpcomingMilestoneWindow = milestoneWindow === "next-30";
  const milestoneWindowDirection = isUpcomingMilestoneWindow ? "next" : "last";

  if (!(showNewHires || showAnniversaries || showBirthdays || showAwards)) return null;

  const visibleCount = [showNewHires, showAnniversaries, showBirthdays, showAwards].filter(
    Boolean,
  ).length;
  const desktopColumns = [
    "",
    "xl:grid-cols-1",
    "xl:grid-cols-2",
    "xl:grid-cols-3",
    "xl:grid-cols-4",
  ][visibleCount];

  const anniversaryRows = recentAnniversaries(employees, isUpcomingMilestoneWindow);
  const birthdayRows = recentBirthdays(employees, isUpcomingMilestoneWindow);
  const awardRows = recentAwards(awards);

  function formatMilestoneRelativeDays(daysAway: number, past = false): string {
    if (daysAway === 0) return "today";
    return isUpcomingMilestoneWindow && !past ? `in ${daysAway}d` : `${daysAway}d ago`;
  }

  return (
    <section aria-label="People and milestones" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">People & milestones</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recent hires, upcoming milestones, and employee recognition.
          </p>
        </div>
        {(showAnniversaries || showBirthdays) && (
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Milestone window</span>
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
      </div>
      <div className={`grid gap-4 ${visibleCount > 1 ? "md:grid-cols-2" : ""} ${desktopColumns}`}>
        {showNewHires && (
          <Card className="flex min-w-0 flex-col overflow-hidden border-border/80">
            <MilestoneHeader
              count={newHires.length}
              loading={employeesLoading}
              unavailable={employeesError}
            >
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                New Hires
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Started in the last {RECENT_HIRE_DAYS} days
              </CardDescription>
            </MilestoneHeader>
            <CardContent
              role="region"
              aria-label="Recent new hires"
              tabIndex={0}
              className="h-72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring overflow-y-auto overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            >
              {employeesLoading ? (
                <div role="status" aria-label="Loading records" className="p-4">
                  <Skeleton className="h-52 w-full" />
                </div>
              ) : employeesError ? (
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  Unable to load this list. Refresh to retry.
                </p>
              ) : newHires.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No new hires in the last {RECENT_HIRE_DAYS} days.
                </p>
              ) : (
                <Table
                  containerClassName="overflow-visible"
                  className="table-fixed text-[13px] [&_td]:break-words [&_td]:px-2 2xl:[&_td]:px-3"
                >
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:px-2 2xl:[&_th]:px-3 [&_th]:text-xs [&_th]:text-muted-foreground">
                    <TableRow>
                      <TableHead className="w-[40%]">Name</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead className="w-[30%] text-right">Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newHires.map((e) => {
                      const daysAgo = tenureDays(e.startDate);
                      return (
                        <TableRow
                          key={e.id}
                          className={
                            daysAgo <= SOON_THRESHOLD_DAYS ? "bg-primary/[0.035]" : undefined
                          }
                        >
                          <TableCell className="font-medium">
                            <EmployeeNameLink employee={e} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">{e.office}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            <time
                              dateTime={e.startDate}
                              title={formatDate(e.startDate)}
                              className="whitespace-nowrap text-foreground"
                            >
                              {compactDate(e.startDate)}
                            </time>
                            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
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
            <MilestoneFooter to="/directory">Open employee directory</MilestoneFooter>
          </Card>
        )}

        {showAnniversaries && (
          <Card className="flex min-w-0 flex-col overflow-hidden border-border/80">
            <MilestoneHeader
              count={anniversaryRows.length}
              loading={employeesLoading}
              unavailable={employeesError}
            >
              <CardTitle className="flex items-center gap-2">
                <AwardIcon className="h-4 w-4 text-muted-foreground" />
                Anniversaries
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                {isUpcomingMilestoneWindow
                  ? `Next ${RECENT_MILESTONE_DAYS} days, plus earlier this month`
                  : `Work anniversaries in the last ${RECENT_MILESTONE_DAYS} days`}
              </CardDescription>
            </MilestoneHeader>
            <CardContent
              role="region"
              aria-label="Work anniversaries"
              tabIndex={0}
              className="h-72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring overflow-y-auto overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            >
              {employeesLoading ? (
                <div role="status" aria-label="Loading records" className="p-4">
                  <Skeleton className="h-52 w-full" />
                </div>
              ) : employeesError ? (
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  Unable to load this list. Refresh to retry.
                </p>
              ) : anniversaryRows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No anniversaries in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days.
                </p>
              ) : (
                <Table
                  containerClassName="overflow-visible"
                  className="table-fixed text-[13px] [&_td]:break-words [&_td]:px-2 2xl:[&_td]:px-3"
                >
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:px-2 2xl:[&_th]:px-3 [&_th]:text-xs [&_th]:text-muted-foreground">
                    <TableRow>
                      <TableHead className="w-[40%]">Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[22%] text-right">Years</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anniversaryRows.map((e) => (
                      <TableRow
                        key={e.id}
                        className={
                          e.daysAway <= SOON_THRESHOLD_DAYS ? "bg-primary/[0.035]" : undefined
                        }
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
                          <span className="whitespace-nowrap text-foreground">
                            {e.monthName.slice(0, 3)} {e.day}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                            ({formatMilestoneRelativeDays(e.daysAway, e.past)})
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className="whitespace-nowrap border-primary/20 bg-primary/5 px-2 font-medium text-primary"
                          >
                            {formatYears(e.years)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <MilestoneFooter to="/anniversaries">View anniversaries</MilestoneFooter>
          </Card>
        )}

        {showBirthdays && (
          <Card className="flex min-w-0 flex-col overflow-hidden border-border/80">
            <MilestoneHeader
              count={birthdayRows.length}
              loading={employeesLoading}
              unavailable={employeesError}
            >
              <CardTitle className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-muted-foreground" />
                Birthdays
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Celebrations in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days
              </CardDescription>
            </MilestoneHeader>
            <CardContent
              role="region"
              aria-label="Employee birthdays"
              tabIndex={0}
              className="h-72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring overflow-y-auto overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            >
              {employeesLoading ? (
                <div role="status" aria-label="Loading records" className="p-4">
                  <Skeleton className="h-52 w-full" />
                </div>
              ) : employeesError ? (
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  Unable to load this list. Refresh to retry.
                </p>
              ) : birthdayRows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No birthdays in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days.
                </p>
              ) : (
                <Table
                  containerClassName="overflow-visible"
                  className="table-fixed text-[13px] [&_td]:break-words [&_td]:px-2 2xl:[&_td]:px-3"
                >
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:px-2 2xl:[&_th]:px-3 [&_th]:text-xs [&_th]:text-muted-foreground">
                    <TableRow>
                      <TableHead className="w-[40%]">Name</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead className="w-[28%] text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {birthdayRows.map((e) => (
                      <TableRow
                        key={e.id}
                        className={
                          e.daysAway <= SOON_THRESHOLD_DAYS ? "bg-primary/[0.035]" : undefined
                        }
                      >
                        <TableCell className="font-medium">
                          <EmployeeNameLink employee={e} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.office}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <span className="whitespace-nowrap text-foreground">
                            {e.monthName.slice(0, 3)} {e.day}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                            ({formatMilestoneRelativeDays(e.daysAway)})
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <MilestoneFooter to="/birthdays">View birthdays</MilestoneFooter>
          </Card>
        )}

        {showAwards && (
          <Card className="flex min-w-0 flex-col overflow-hidden border-border/80">
            <MilestoneHeader
              count={awardRows.length}
              loading={awardsLoading}
              unavailable={awardsError}
            >
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                Awards
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Recognition given in the last {RECENT_MILESTONE_DAYS} days
              </CardDescription>
            </MilestoneHeader>
            <CardContent
              role="region"
              aria-label="Recent awards"
              tabIndex={0}
              className="h-72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring overflow-y-auto overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            >
              {awardsLoading ? (
                <div role="status" aria-label="Loading records" className="p-4">
                  <Skeleton className="h-52 w-full" />
                </div>
              ) : awardsError ? (
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  Unable to load this list. Refresh to retry.
                </p>
              ) : awardRows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No awards given in the last {RECENT_MILESTONE_DAYS} days.
                </p>
              ) : (
                <Table
                  containerClassName="overflow-visible"
                  className="table-fixed text-[13px] [&_td]:break-words [&_td]:px-2 2xl:[&_td]:px-3"
                >
                  <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:h-9 [&_th]:px-2 2xl:[&_th]:px-3 [&_th]:text-xs [&_th]:text-muted-foreground">
                    <TableRow>
                      <TableHead className="w-[37%]">Employee</TableHead>
                      <TableHead>Award</TableHead>
                      <TableHead className="w-[28%] text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {awardRows.map((a) => (
                      <TableRow
                        key={a.id}
                        className={
                          a.daysAgo <= SOON_THRESHOLD_DAYS ? "bg-primary/[0.035]" : undefined
                        }
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
                                <button
                                  type="button"
                                  className="text-left text-foreground underline decoration-border underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  {a.title}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-64">{a.description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            a.title
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <time
                            dateTime={a.awardedDate}
                            title={formatDate(a.awardedDate)}
                            className="whitespace-nowrap text-foreground"
                          >
                            {compactDate(a.awardedDate)}
                          </time>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                            ({a.daysAgo === 0 ? "today" : `${a.daysAgo}d ago`})
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <MilestoneFooter to="/awards">View awards</MilestoneFooter>
          </Card>
        )}
      </div>
    </section>
  );
}
