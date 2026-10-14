import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type SnapshotTone = "green" | "teal" | "alert" | "slate";
export type SnapshotStat = { label: string; value: number; tone: SnapshotTone };
const TONE_CLASS: Record<SnapshotTone, string> = {
  green: "text-primary",
  teal: "text-sky-700 dark:text-sky-300",
  alert: "text-red-700 dark:text-red-300",
  slate: "text-foreground",
};
export function SnapshotCard({
  icon: Icon,
  title,
  description,
  stats,
  to,
  cta,
  loading,
  unavailable,
}: {
  seed: string;
  icon: LucideIcon;
  title: string;
  description: string;
  stats: [SnapshotStat, SnapshotStat, SnapshotStat];
  to: NonNullable<LinkProps["to"]>;
  cta: string;
  loading?: boolean;
  unavailable?: boolean;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col" aria-busy={loading}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid flex-1 grid-cols-3 gap-3 divide-x divide-border/70">
          {stats.map((stat, index) => (
            <div key={stat.label} className={index ? "pl-3" : ""}>
              {loading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className={`text-2xl font-semibold tabular-nums ${TONE_CLASS[stat.tone]}`}>
                  {unavailable ? "—" : stat.value.toLocaleString()}
                </p>
              )}
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
        {unavailable && (
          <p className="text-xs text-muted-foreground">
            Unable to load this summary. Open the module to retry.
          </p>
        )}
        <Button asChild size="sm" variant="ghost" className="-mx-2 justify-between text-primary">
          <Link to={to}>
            {cta}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
