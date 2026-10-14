// The Dashboard's "welcome back" banner: dark circuit-board band, a greeting
// by name, shortcuts to Settings / personalising the Dashboard, and a close
// button. Dismissal lasts for the browser session (sessionStorage), so it
// greets you once per sign-in rather than nagging on every visit to the
// Dashboard — and, like the intro video, a fresh sign-in shows it again.
//
// Motion: slides/fades in, the wave icon waves twice, and closing slides it
// back up before it unmounts. All of it is skipped (the banner just appears
// and disappears) when "Interface animations" is off in Settings; the slide
// and fade are also gated behind the OS reduced-motion setting via motion-safe.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Hand, Settings, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";
import { useCircuitBand } from "@/lib/use-circuit-background";
import { cn } from "@/lib/utils";

export const WELCOME_SESSION_KEY = "tgo-welcome-dismissed";
const CLOSE_MS = 150;
const OPEN_MS = 180;

type State = "pending" | "open" | "closing" | "hidden";

export function WelcomeBanner() {
  const { data: account } = useCurrentAccount();
  const animate = account?.animations_enabled ?? true;
  const { setRef, style } = useCircuitBand("modal", "welcome-banner");
  const [state, setState] = useState<State>("pending");

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
    } catch {
      // Storage blocked — show it; it'll just reappear on reload.
    }
    setState(dismissed ? "hidden" : "open");
  }, []);

  function close() {
    try {
      sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    if (!animate) {
      setState("hidden");
      return;
    }
    setState("closing");
    window.setTimeout(() => setState("hidden"), CLOSE_MS);
  }

  if (!account || state === "pending" || state === "hidden") return null;

  const name = account.first_name || account.display_name || account.email.split("@")[0] || "there";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      ref={setRef}
      role="region"
      aria-label="Welcome"
      // animationDuration is what tw-animate-css reads for its enter/exit length.
      style={{
        ...style,
        animationDuration: state === "closing" ? `${CLOSE_MS}ms` : `${OPEN_MS}ms`,
      }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/10 px-4 py-3 text-white shadow-sm sm:px-5",
        animate &&
          (state === "closing"
            ? "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:slide-out-to-top-3"
            : "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-3"),
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 pr-8">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
            <Hand className="h-6 w-6 origin-[70%_80%] text-[#72b360]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight">
              Welcome back, {name}
            </h2>
            <p className="mt-0.5 text-xs text-white/70">
              {today} · signed in as {ROLE_LABELS[account.role]}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:pr-8">
          <Button asChild size="sm" className="bg-white text-[#183445] hover:bg-white/90">
            <Link to="/settings">
              <Settings className="mr-1.5 h-4 w-4" /> Open Settings
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link to="/settings" hash="dashboard-cards">
              <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Personalize
            </Link>
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Dismiss welcome message"
        className="absolute right-3 top-3 cursor-pointer rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
