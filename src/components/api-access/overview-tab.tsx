// The API Access Overview: is anything wrong, how busy is the API, and what is
// being asked for. Live - refetches every 15s (see @/data/api-access-store).

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  KeyRound,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiStatsQuery } from "@/data/api-access-store";
import { cn } from "@/lib/utils";

const RANGES = [
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
] as const;

const chartConfig = {
  ok: { label: "Succeeded", color: "var(--sidebar)" },
  errors: { label: "Failed", color: "hsl(0 72% 51%)" },
} satisfies ChartConfig;

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  loading: boolean;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-2.5 bg-sidebar px-4 py-2.5 text-sidebar-foreground">
        <span className="flex size-7 items-center justify-center rounded-md bg-white/10">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="text-xs font-semibold">{title}</p>
      </div>
      <CardContent className="p-4">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function formatBucket(value: string, bucket: "hour" | "day"): string {
  const date = new Date(value);
  return bucket === "hour"
    ? date.toLocaleTimeString("en-US", { hour: "numeric" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function OverviewTab({ onOpenActivity }: { onOpenActivity: () => void }) {
  const [hours, setHours] = useState<number>(24);
  const { data, isLoading, isError, dataUpdatedAt } = useApiStatsQuery(hours);
  const now = useNow(5_000);
  const updatedSeconds = dataUpdatedAt
    ? Math.max(0, Math.round((now - dataUpdatedAt) / 1000))
    : null;
  const rangeLabel = RANGES.find((r) => r.hours === hours)?.label ?? "";

  const chartData = (data?.series ?? []).map((point) => ({
    label: formatBucket(point.bucket, data?.bucket ?? "hour"),
    ok: point.total - point.errors,
    errors: point.errors,
  }));
  const endpointMax = Math.max(1, ...(data?.endpoints ?? []).map((e) => e.count));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Live{updatedSeconds !== null ? ` · updated ${updatedSeconds}s ago` : ""}
        </Badge>
        <div
          role="group"
          aria-label="Time range"
          className="inline-flex rounded-lg border bg-muted/50 p-0.5"
        >
          {RANGES.map((range) => (
            <button
              key={range.hours}
              type="button"
              onClick={() => setHours(range.hours)}
              aria-pressed={hours === range.hours}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1 text-sm transition-colors",
                hours === range.hours
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> Couldn't load API statistics.
        </div>
      ) : data && data.requests === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" /> No requests in this period yet. Create a key and call the
          API to see activity here.
        </div>
      ) : data && data.errors === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> All quiet. Every request in this period was handled
          normally.
        </div>
      ) : data ? (
        <button
          type="button"
          onClick={onOpenActivity}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" /> {data.errors.toLocaleString()} of{" "}
          {data.requests.toLocaleString()} requests failed in this period. View them in Activity.
        </button>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Requests"
          value={data ? data.requests.toLocaleString() : "-"}
          hint={`last ${rangeLabel}`}
          icon={Activity}
          loading={isLoading}
        />
        <StatCard
          title="Success rate"
          value={data?.successRate != null ? `${data.successRate}%` : "-"}
          hint={data && data.errors > 0 ? `${data.errors.toLocaleString()} failed` : "No errors"}
          icon={ShieldCheck}
          loading={isLoading}
        />
        <StatCard
          title="Avg response"
          value={data?.avgMs != null ? `${data.avgMs} ms` : "-"}
          hint={data?.p95Ms != null ? `95% under ${data.p95Ms} ms` : "No data yet"}
          icon={Gauge}
          loading={isLoading}
        />
        <StatCard
          title="Keys in use"
          value={data ? String(data.activeKeys) : "-"}
          hint={data ? `of ${data.totalKeys} total` : ""}
          icon={KeyRound}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Requests over time</CardTitle>
            <CardDescription>
              Per {data?.bucket ?? "hour"}, last {rangeLabel}. Errors are shown in red.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <p className="py-20 text-center text-sm text-muted-foreground">
                Nothing to chart yet.
              </p>
            ) : (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="ok" stackId="a" fill="var(--color-ok)" radius={[0, 0, 2, 2]} />
                  <Bar
                    dataKey="errors"
                    stackId="a"
                    fill="var(--color-errors)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">What's being asked for</CardTitle>
              <CardDescription>Requests by endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {data && data.endpoints.length > 0 ? (
                data.endpoints.map((endpoint) => (
                  <div key={endpoint.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">{endpoint.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {endpoint.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-sidebar"
                        style={{ width: `${(endpoint.count / endpointMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No requests yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>Status codes returned</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {data && data.statuses.length > 0 ? (
                data.statuses.map((status) => (
                  <Badge
                    key={status.label}
                    variant="outline"
                    className={cn(
                      "font-mono",
                      Number(status.label) < 400
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-destructive/40 bg-destructive/10 text-destructive",
                    )}
                  >
                    {status.label} {status.count.toLocaleString()}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No requests yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
