// A module snapshot card for the Dashboard: dark circuit header (same band as
// the metric cards), a small bar chart of the three headline numbers that
// grows in on load, and the "open module" button. The bars compare the three
// values to each other (tallest = the largest of the three), which stays
// honest even when the numbers aren't parts of one whole (e.g. HMO "Cards
// Pending" is a subset of "Active").
//
// The grow-in is a GPU-only scaleY transition with a small stagger, and is
// skipped entirely when the account has turned animations off in Settings.

import { useEffect, useState } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { BandedCardHeader } from "@/components/banded-card-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { useCurrentAccount } from "@/lib/session";

export type SnapshotTone = "green" | "teal" | "alert" | "slate";

export type SnapshotStat = {
  label: string;
  value: number;
  tone: SnapshotTone;
};

const TONE_CLASS: Record<SnapshotTone, string> = {
  green: "bg-[#72b360]",
  teal: "bg-[#2f6f8f]",
  alert: "bg-destructive",
  slate: "bg-slate-400/70 dark:bg-slate-400/50",
};

const BAR_AREA_PX = 56;
const MIN_BAR_PX = 4;

export function SnapshotCard({
  seed,
  icon: Icon,
  title,
  description,
  stats,
  to,
  cta,
}: {
  seed: string;
  icon: LucideIcon;
  title: string;
  description: string;
  stats: [SnapshotStat, SnapshotStat, SnapshotStat];
  to: NonNullable<LinkProps["to"]>;
  cta: string;
}) {
  const { data: account } = useCurrentAccount();
  const animate = account?.animations_enabled ?? true;
  // Starts collapsed and flips on the next frame, so the transition has a
  // "from" state to animate from.
  const [grown, setGrown] = useState(!animate);
  useEffect(() => {
    if (!animate) {
      setGrown(true);
      return;
    }
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const max = Math.max(1, ...stats.map((s) => s.value));

  return (
    <Card className="overflow-hidden">
      <BandedCardHeader seed={seed}>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </BandedCardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          {stats.map((stat, i) => {
            const height =
              stat.value === 0
                ? MIN_BAR_PX
                : Math.max(MIN_BAR_PX + 4, Math.round((stat.value / max) * BAR_AREA_PX));
            return (
              <div key={stat.label} className="flex flex-col items-center">
                <p className="text-2xl font-semibold tabular-nums">{stat.value.toLocaleString()}</p>
                <div
                  className="mt-2 flex w-full items-end justify-center border-b border-border/70"
                  style={{ height: BAR_AREA_PX }}
                  aria-hidden="true"
                >
                  <div
                    className={`w-8 origin-bottom rounded-t-md ${stat.value === 0 ? "bg-muted-foreground/25" : TONE_CLASS[stat.tone]}`}
                    style={{
                      height,
                      transform: grown ? "scaleY(1)" : "scaleY(0)",
                      transition: animate
                        ? `transform 650ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 90}ms`
                        : "none",
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            );
          })}
        </div>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to={to}>
            {cta} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
