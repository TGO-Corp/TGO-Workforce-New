// Dashboard "Hub Utilisation": the ACTIVE workforce split across offices as an
// animated donut (total headcount in the middle) plus one row per office with
// its share, headcount and a bar that fills in on load. Fills the
// height of the grid cell it sits in instead of leaving a blank lower half.
// Motion follows the Settings "Interface animations" switch.

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";

import { BandedCardHeader } from "@/components/banded-card-header";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentAccount } from "@/lib/session";

type OfficeRow = { office: string; active: number; inactive: number };

// Brand green, then the lighter navy family — stable per office position.
const OFFICE_COLORS = ["#72b360", "#2f6f8f", "#c9a24a", "#8a7bb5", "#d46a5e"];

export function HubUtilisationCard({ offices }: { offices: OfficeRow[] }) {
  const { data: account } = useCurrentAccount();
  const animate = account?.animations_enabled ?? true;
  const [mounted, setMounted] = useState(false);
  const [filled, setFilled] = useState(!animate);
  useEffect(() => {
    setMounted(true);
    if (!animate) {
      setFilled(true);
      return;
    }
    const frame = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const rows = offices.map((o, i) => ({
    ...o,
    total: o.active,
    color: OFFICE_COLORS[i % OFFICE_COLORS.length] ?? "#72b360",
  }));
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <Card className="flex flex-col overflow-hidden">
      <BandedCardHeader seed="hub-utilisation">
        <CardTitle>Hub Utilisation</CardTitle>
        <CardDescription>Share of active workforce per office</CardDescription>
      </BandedCardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-5 pt-5">
        <div className="relative mx-auto h-[170px] w-[170px]">
          {!mounted ? (
            <Skeleton className="h-full w-full rounded-full" />
          ) : (
            <ChartContainer config={{}} className="h-full w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="office" hideLabel />} />
                <Pie
                  data={rows}
                  dataKey="total"
                  nameKey="office"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={rows.length > 1 ? 3 : 0}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={animate}
                  animationDuration={900}
                >
                  {rows.map((r) => (
                    <Cell key={r.office} fill={r.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-semibold tabular-nums">{grandTotal.toLocaleString()}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active</p>
          </div>
        </div>

        <div className="space-y-4">
          {rows.map((r, i) => {
            const pct = grandTotal ? Math.round((r.total / grandTotal) * 100) : 0;
            return (
              <div key={r.office} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    {r.office}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{pct}%</span> ·{" "}
                    {r.total.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full origin-left rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: r.color,
                      transform: filled ? "scaleX(1)" : "scaleX(0)",
                      transition: animate
                        ? `transform 800ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 120}ms`
                        : "none",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
