// The Dashboard's "What's new" overview: the most recent releases from
// src/data/release-notes.ts, a few lines each, with an exit (X) button to put it
// away. Dismissal is remembered per release in this browser, so it stays gone
// until a NEWER version is announced — then it comes back for everyone. After
// dismissing, a small "What's new" button stays so the notes can be reopened.
//
// Shown to every role (it's about the app, not about anyone's data), so it
// needs no permission and makes no request.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LATEST_RELEASE,
  RELEASE_NOTES,
  type ReleaseNote,
  type ReleaseNoteKind,
} from "@/data/release-notes";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "tgo-whats-new-dismissed";
const COLLAPSED_COUNT = 3;

const KIND: Record<ReleaseNoteKind, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  improved: {
    label: "Improved",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  fixed: {
    label: "Fixed",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

function formatReleaseDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ReleaseSection({ release, latest }: { release: ReleaseNote; latest: boolean }) {
  return (
    <section aria-label={`Version ${release.version}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold">{release.title}</h3>
        {latest && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            Latest
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          v{release.version} · {formatReleaseDate(release.date)}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {release.items.map((item) => (
          <li key={item.text} className="flex items-start gap-2.5 text-sm">
            <Badge
              variant="outline"
              className={cn(
                "mt-0.5 h-5 w-[68px] shrink-0 justify-center px-1 text-[10px] font-medium",
                KIND[item.kind].className,
              )}
            >
              {KIND[item.kind].label}
            </Badge>
            <span className="min-w-0 text-muted-foreground">{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WhatsNewCard() {
  // "pending" until localStorage has been read (it isn't available during the
  // server render), so there's no flash of the card for someone who dismissed it.
  const [state, setState] = useState<"pending" | "open" | "dismissed">("pending");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let dismissedVersion: string | null = null;
    try {
      dismissedVersion = localStorage.getItem(DISMISSED_KEY);
    } catch {
      // Storage blocked — show it; it simply returns on the next visit.
    }
    setState(dismissedVersion === LATEST_RELEASE.version ? "dismissed" : "open");
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, LATEST_RELEASE.version);
    } catch {
      // ignore
    }
    setState("dismissed");
  }

  if (state === "pending") return null;

  if (state === "dismissed") {
    return (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() => setState("open")}
        >
          <Sparkles className="size-3.5" /> What's new
        </Button>
      </div>
    );
  }

  const releases = showAll ? RELEASE_NOTES : RELEASE_NOTES.slice(0, COLLAPSED_COUNT);
  const hiddenCount = RELEASE_NOTES.length - COLLAPSED_COUNT;

  return (
    <Card role="region" aria-label="What's new">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            What's new
          </CardTitle>
          <CardDescription>
            Recent updates to TGO Workforce · latest version {LATEST_RELEASE.version}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-1 size-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={dismiss}
          aria-label="Dismiss what's new"
          title="Dismiss"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          className={cn(
            "space-y-5",
            // Many releases open: scroll inside the card instead of pushing the
            // rest of the Dashboard far down the page.
            showAll && "max-h-[28rem] overflow-y-auto pr-1",
          )}
        >
          {releases.map((release, index) => (
            <ReleaseSection key={release.version} release={release} latest={index === 0} />
          ))}
        </div>
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={() => setShowAll((current) => !current)}
            aria-expanded={showAll}
          >
            {showAll ? (
              <>
                <ChevronUp className="size-3.5" /> Show fewer
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" /> Show {hiddenCount} older update
                {hiddenCount === 1 ? "" : "s"}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
