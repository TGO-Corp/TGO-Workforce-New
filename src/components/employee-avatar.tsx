// Small avatar (photo, falling back to initials) for an employee row —
// Employee Directory and Manage Employees tables, the header/employee-picker
// search results, and anywhere else a compact employee identity marker is
// wanted alongside their name. Not the same component as the larger one
// inside @/components/employee-hover-card's popover.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Employee } from "@/data/employees";
import { cn } from "@/lib/utils";

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

export function EmployeeAvatar({
  employee,
  className,
}: {
  employee: Pick<Employee, "name" | "photoUrl">;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-7 shrink-0", className)}>
      {employee.photoUrl && <AvatarImage src={employee.photoUrl} alt={employee.name} />}
      <AvatarFallback className="text-[10px]">{initials(employee.name)}</AvatarFallback>
    </Avatar>
  );
}
