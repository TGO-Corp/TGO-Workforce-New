// "Exits in the Last 30 Days" — the full-width departures table on the
// Admin/Super Admin Dashboard. Moved out of src/routes/index.tsx unchanged.

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

export function RecentExitsCard({ exits }: { exits: (Employee & { daysAgo: number })[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Exits in the Last {RECENT_MILESTONE_DAYS} Days
        </CardTitle>
        <CardDescription>Departures across every hub, most recent first</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {exits.length === 0 ? (
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
                  <TableHead>Office</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Exit Date</TableHead>
                  <TableHead className="text-right">Days Ago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exits.map((e) => (
                  <TableRow
                    key={e.id}
                    className={e.daysAgo <= SOON_THRESHOLD_DAYS ? "bg-amber-500/5" : undefined}
                  >
                    <TableCell className="font-medium">
                      <EmployeeNameLink employee={e} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={EXIT_STATUS_VARIANT[e.status] ?? "secondary"}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.office}</TableCell>
                    <TableCell className="text-muted-foreground">{e.department}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(e.exitDate)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {e.daysAgo === 0 ? "today" : `${e.daysAgo} days`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
