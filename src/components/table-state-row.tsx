// One consistent look for the three non-data states of a table body —
// loading, error, and empty — instead of each page hand-rolling a bare line
// of grey text. Renders a full-width row so it drops straight into any
// <TableBody>. Error rows can offer a Retry (pass the query's refetch).

import { CircleAlert, Inbox, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

type Kind = "loading" | "error" | "empty";

export function TableStateRow({
  colSpan,
  kind,
  title,
  description,
  onRetry,
}: {
  colSpan: number;
  kind: Kind;
  title: string;
  description?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const Icon = kind === "loading" ? Loader2 : kind === "error" ? CircleAlert : Inbox;
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-10">
        <div
          className="flex flex-col items-center gap-2 text-center"
          role={kind === "error" ? "alert" : "status"}
        >
          <Icon
            className={
              kind === "loading"
                ? "h-6 w-6 animate-spin text-muted-foreground"
                : kind === "error"
                  ? "h-6 w-6 text-destructive"
                  : "h-6 w-6 text-muted-foreground"
            }
          />
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
          {kind === "error" && onRetry && (
            <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
