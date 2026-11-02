// "What's new" as a modal: opens by itself on the Dashboard the first time
// someone lands there after a release (the intro video, when on, plays first -
// the Dashboard isn't mounted until it ends), shows the latest release up front
// and the earlier ones folded underneath. Closing it remembers the version in
// this browser, so it stays quiet until a NEWER version is announced. A small
// "What's new" button stays on the Dashboard to reopen it.
//
// Release content comes from src/data/release-notes.ts. Shown to every role (it
// is about the app, not anyone's data), so no permission and no request.

import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  LATEST_RELEASE,
  RELEASE_NOTES,
  type ReleaseNote,
  type ReleaseNoteKind,
} from "@/data/release-notes";
import { cn } from "@/lib/utils";

const SEEN_KEY = "tgo-whats-new-dismissed";

const KIND: Record<ReleaseNoteKind, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  improved: {
    label: "Improved",
    className: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  fixed: {
    label: "Fixed",
    className: "bg-amber-500/14 text-amber-800 dark:text-amber-300",
  },
};

function formatReleaseDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Staggered rise-in; skipped for people who ask for less motion.
function rise(index: number) {
  return {
    className:
      "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none",
    style: { animationDelay: `${150 + index * 70}ms` },
  };
}

function KindPill({ kind }: { kind: ReleaseNoteKind }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide",
        KIND[kind].className,
      )}
    >
      {KIND[kind].label}
    </span>
  );
}

function EarlierRelease({ release }: { release: ReleaseNote }) {
  const [open, setOpen] = useState(false);
  const panelId = `release-${release.version}`;
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{release.title}</span>
          <span className="block text-xs text-muted-foreground">
            {release.items.length} {release.items.length === 1 ? "change" : "changes"} ·{" "}
            {formatReleaseDate(release.date)}
          </span>
        </span>
        <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
          v{release.version}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul id={panelId} className="space-y-2 pb-4 pl-12 pr-1">
          {release.items.map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 shrink-0">
                <KindPill kind={item.kind} />
              </span>
              <span className="min-w-0 text-muted-foreground">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function WhatsNewModal() {
  // "pending" until localStorage has been read (it isn't available during the
  // server render), so nothing flashes for someone who has already seen it.
  const [state, setState] = useState<"pending" | "open" | "closed">("pending");

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      // Storage blocked: show it; it simply returns on the next visit.
    }
    setState(seen === LATEST_RELEASE.version ? "closed" : "open");
  }, []);

  function handleOpenChange(open: boolean) {
    if (open) {
      setState("open");
      return;
    }
    try {
      localStorage.setItem(SEEN_KEY, LATEST_RELEASE.version);
    } catch {
      // ignore
    }
    setState("closed");
  }

  if (state === "pending") return null;

  const earlier = RELEASE_NOTES.slice(1);

  return (
    <>
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

      <Dialog open={state === "open"} onOpenChange={handleOpenChange}>
        <DialogContent className="grid max-h-[min(44rem,calc(100dvh-2rem))] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl [&>button]:right-4 [&>button]:top-4 [&>button]:flex [&>button]:size-8 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/20">
          <div className="relative isolate overflow-hidden bg-sidebar px-6 pb-7 pt-6 text-sidebar-foreground sm:px-8">
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 360 160"
              fill="none"
              className="pointer-events-none absolute -right-10 -top-6 -z-10 h-44 w-[22rem] text-sidebar-foreground opacity-[0.13]"
            >
              <circle cx="250" cy="80" r="56" stroke="currentColor" />
              <circle cx="250" cy="80" r="82" stroke="currentColor" />
              <ellipse cx="250" cy="80" rx="26" ry="56" stroke="currentColor" />
              <path
                d="M194 80h112M203 50h94M203 110h94M20 120h150l28-34M90 150h80l30-30"
                stroke="currentColor"
              />
              <circle cx="90" cy="150" r="3" fill="currentColor" />
              <circle cx="20" cy="120" r="3" fill="currentColor" />
            </svg>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -left-10 -z-10 size-48 rounded-full bg-sidebar-primary/20 blur-3xl"
            />
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-primary">
              <Sparkles className="size-3.5" aria-hidden="true" />
              What's new
              <span className="text-sidebar-foreground/50">·</span>
              <span className="tabular-nums text-sidebar-foreground/80">
                v{LATEST_RELEASE.version}
              </span>
            </p>
            <p className="mt-1.5 text-xs text-sidebar-foreground/65">
              {formatReleaseDate(LATEST_RELEASE.date)}
            </p>
            <DialogTitle className="mt-4 text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-[2rem]">
              Fresh updates,
              <br />
              <span className="text-sidebar-primary">every release.</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              What changed in TGO Workforce in version {LATEST_RELEASE.version}, and recent earlier
              updates.
            </DialogDescription>
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-6 sm:px-8">
            <section aria-label={`Version ${LATEST_RELEASE.version}`}>
              <h3 className="text-lg font-semibold tracking-tight">{LATEST_RELEASE.title}</h3>
              <ul className="mt-4 space-y-4">
                {LATEST_RELEASE.items.map((item, index) => {
                  const motion = rise(index);
                  return (
                    <li key={item.text} className={motion.className} style={motion.style}>
                      <KindPill kind={item.kind} />
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {item.text}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>

            {earlier.length > 0 && (
              <section aria-label="Earlier updates" className="mt-7 border-t pt-5">
                <h3 className="text-sm font-semibold">Also improved</h3>
                <ul className="mt-2">
                  {earlier.map((release) => (
                    <EarlierRelease key={release.version} release={release} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4 sm:px-8">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
              You're up to date
            </p>
            <Button onClick={() => handleOpenChange(false)} className="min-w-28">
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
