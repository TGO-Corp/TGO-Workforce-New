// The Dashboard's row of milestone cards: recent New Hires, Anniversaries,
// Birthdays and Awards, with the shared "next / last 30 days" picker above the
// date-based ones. Each card is shown only when the page says so (permission
// plus the person's own Settings toggles). Keep these as separate scrollable
// cards so all four lists can be scanned together.

import { useState, type ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCircuitBand } from "@/lib/use-circuit-background";
import { Award as AwardIcon, Cake, Trophy, UserPlus } from "lucide-react";

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

// Preserve the branded headers in the reference layout without restyling other modules.
function MilestoneHeader({ seed, ...props }: ComponentProps<typeof CardHeader> & { seed: string }) {
  const { setRef, style } = useCircuitBand("card", seed);
  return (
    <CardHeader
      ref={setRef}
      style={style}
      className="text-white [&_.text-muted-foreground]:text-white/70"
      {...props}
    />
  );
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
  const milestoneWindowLabel = MILESTONE_TIME_FILTER_LABELS[milestoneWindow];
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
    <div className="space-y-3">
      {(showAnniversaries || showBirthdays) && (
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

      <div className={`grid gap-4 ${visibleCount > 1 ? "md:grid-cols-2" : ""} ${desktopColumns}`}>
        {showNewHires && (
          <Card className="overflow-hidden">
            <MilestoneHeader seed="new-hires">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                New Hires ({RECENT_HIRE_DAYS} days)
              </CardTitle>
              <CardDescription>Started in the last {RECENT_HIRE_DAYS} days</CardDescription>
            </MilestoneHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
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
                <Table>
                  <TableHeader className="bg-[#183445] [&_th]:text-white/90">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead className="text-right">Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newHires.map((e) => {
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
          <Card className="overflow-hidden">
            <MilestoneHeader seed="anniversaries">
              <CardTitle className="flex items-center gap-2">
                <AwardIcon className="h-4 w-4 text-muted-foreground" />
                Anniversaries ({milestoneWindowLabel})
              </CardTitle>
              <CardDescription>
                {isUpcomingMilestoneWindow
                  ? `Work anniversaries earlier this month and in the next ${RECENT_MILESTONE_DAYS} days`
                  : `Work anniversaries in the last ${RECENT_MILESTONE_DAYS} days`}
              </CardDescription>
            </MilestoneHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
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
                <Table>
                  <TableHeader className="bg-[#183445] [&_th]:text-white/90">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Years</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anniversaryRows.map((e) => (
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

        {showBirthdays && (
          <Card className="overflow-hidden">
            <MilestoneHeader seed="birthdays">
              <CardTitle className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-muted-foreground" />
                Birthdays ({milestoneWindowLabel})
              </CardTitle>
              <CardDescription>
                Celebrations in the {milestoneWindowDirection} {RECENT_MILESTONE_DAYS} days
              </CardDescription>
            </MilestoneHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
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
                <Table>
                  <TableHeader className="bg-[#183445] [&_th]:text-white/90">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {birthdayRows.map((e) => (
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

        {showAwards && (
          <Card className="overflow-hidden">
            <MilestoneHeader seed="awards">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                Awards ({RECENT_MILESTONE_DAYS} days)
              </CardTitle>
              <CardDescription>
                Recognition given in the last {RECENT_MILESTONE_DAYS} days
              </CardDescription>
            </MilestoneHeader>
            <CardContent className="max-h-80 overflow-y-auto p-0">
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
                <Table>
                  <TableHeader className="bg-[#183445] [&_th]:text-white/90">
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Award</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {awardRows.map((a) => (
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
}
