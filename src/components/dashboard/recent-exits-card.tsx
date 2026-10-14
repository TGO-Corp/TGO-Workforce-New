// "Exits in the Last 30 Days" — the full-width departures table on the
// Admin/Super Admin Dashboard. Moved out of src/routes/index.tsx unchanged.

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogOut } from "lucide-react";

import { EmployeeNameLink } from "@/components/employee-name-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, type Employee } from "@/data/employees";
import { RECENT_MILESTONE_DAYS, SOON_THRESHOLD_DAYS } from "@/lib/dashboard-data";

const EXIT_STATUS_VARIANT: Record<string, "secondary" | "destructive"> = {
  Resigned: "secondary",
  Terminated: "destructive",
};

export function RecentExitsCard({
  exits,
  loading = false,
  unavailable = false,
}: {
  exits: (Employee & { daysAgo: number })[];
  loading?: boolean;
  unavailable?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Recent exits
        </CardTitle>
        <CardDescription>Last {RECENT_MILESTONE_DAYS} days · most recent first</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <Skeleton className="mx-5 mb-5 h-40" />
        ) : unavailable ? (
          <p className="p-5 text-sm text-muted-foreground">Unable to load departures.</p>
        ) : exits.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No departures in the last {RECENT_MILESTONE_DAYS} days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Exit Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exits.slice(0, 5).map((e) => (
                  <TableRow
                    key={e.id}
                    className={e.daysAgo <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                  >
                    <TableCell className="font-medium">
                      <EmployeeNameLink employee={e} />
                      <p className="mt-0.5 text-xs font-normal text-muted-foreground">{e.office}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={EXIT_STATUS_VARIANT[e.status] ?? "secondary"}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(e.exitDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t px-5 py-2 text-xs text-muted-foreground">
          <span>
            {loading
              ? "Loading…"
              : unavailable
                ? "Data unavailable"
                : `${exits.length} departures in this period`}
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link to="/directory">View directory →</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
