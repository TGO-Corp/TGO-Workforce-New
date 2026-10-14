import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type AttentionItem = {
  label: string;
  description: string;
  count: number;
  to: NonNullable<LinkProps["to"]>;
  tone?: "warning" | "danger";
  loading: boolean;
  unavailable: boolean;
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = items.filter((item) => item.loading || item.unavailable || item.count > 0);
  return (
    <Card className="order-first h-full xl:order-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          Needs attention
        </CardTitle>
        <CardDescription>Pending work across your available modules</CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length ? (
          <div className="divide-y divide-border/60">
            {(expanded ? visible : visible.slice(0, 4)).map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="group flex items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.loading ? (
                  <Skeleton className="size-9 shrink-0" />
                ) : (
                  <span
                    className={`flex min-w-9 shrink-0 items-center justify-center rounded-lg px-2 py-1.5 text-sm font-semibold tabular-nums ${item.unavailable ? "bg-muted text-muted-foreground" : item.tone === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}
                  >
                    {item.unavailable ? "—" : item.count.toLocaleString()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {item.unavailable
                      ? "Data unavailable · open module to retry"
                      : item.description}
                  </p>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center">
            <span className="rounded-full bg-primary/10 p-3">
              <CheckCircle2 className="size-6 text-primary" />
            </span>
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="max-w-60 text-xs leading-relaxed text-muted-foreground">
              {items.length
                ? "No pending items in the workflows shown here."
                : "Your available module summaries appear below."}
            </p>
          </div>
        )}
        {visible.length > 4 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? "Show fewer" : `Show all ${visible.length} categories`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
