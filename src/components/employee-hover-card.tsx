// Quick-info preview shown when hovering an employee's name in the
// Employee Directory table — mirrors @/components/user-hover-card's own
// account version. The full profile lives at its own route
// (/directory/$employeeId), not a dialog, so this is just the HoverCard
// wrapper around whatever trigger (a Link, usually) is passed as children —
// partial details only (name, position, office, status, tenure), not the
// full employment/anniversary/awards breakdown that page shows.
import { type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import {
  formatDate,
  isInTraining,
  tenure,
  type Employee,
  type EmployeeStatus,
} from "@/data/employees";

const STATUS_VARIANT: Record<EmployeeStatus, "default" | "secondary" | "destructive"> = {
  Active: "default",
  Resigned: "secondary",
  Terminated: "destructive",
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function EmployeeHoverCard({
  employee,
  children,
}: {
  employee: Employee;
  children: ReactNode;
}) {
  const training = isInTraining(employee);

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-72">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            {employee.photoUrl && <AvatarImage src={employee.photoUrl} alt={employee.name} />}
            <AvatarFallback className="text-xs">{initials(employee.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{employee.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {employee.position || "—"} · {employee.office}
            </p>
          </div>
        </div>
        <Separator className="my-3" />
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            {training ? (
              <Badge
                variant="outline"
                className="border-sky-500/40 bg-sky-500/10 font-normal text-sky-600 dark:text-sky-400"
              >
                Training
              </Badge>
            ) : (
              <Badge variant={STATUS_VARIANT[employee.status]} className="font-normal">
                {employee.status}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Department</span>
            <span>{employee.department}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tenure</span>
            <span>{tenure(employee.startDate, employee.exitDate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Started</span>
            <span>{formatDate(employee.startDate)}</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Click to view full profile</p>
      </HoverCardContent>
    </HoverCard>
  );
}
