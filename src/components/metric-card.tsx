import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  onClick,
  loading = false,
  unavailable = false,
  tone = "neutral",
}: {
  title: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  onClick?: () => void;
  loading?: boolean;
  unavailable?: boolean;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const iconTone = {
    neutral: "bg-muted text-muted-foreground",
    positive: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
    danger: "bg-red-500/10 text-red-700 dark:text-red-300",
  }[tone];
  const interactive = !!onClick && !loading && !unavailable;
  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `View ${title.toLowerCase()} details` : undefined}
      aria-busy={loading}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "min-w-0",
        interactive &&
          "group cursor-pointer transition-colors duration-150 hover:border-primary/40 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-h-10 text-sm font-medium leading-snug text-muted-foreground">{title}</p>
          <span
            className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", iconTone)}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <div
          className={cn(
            "mt-2 font-semibold leading-tight tracking-tight tabular-nums",
            typeof value === "string" && value.length > 12 ? "break-words text-xl" : "text-3xl",
          )}
        >
          {loading ? (
            <Skeleton className="h-9 w-20" />
          ) : unavailable ? (
            <span aria-label="Unavailable">—</span>
          ) : typeof value === "number" ? (
            value.toLocaleString()
          ) : (
            value
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {unavailable ? "Unable to load data" : hint}
          </p>
          {interactive && (
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary"
              aria-hidden="true"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
