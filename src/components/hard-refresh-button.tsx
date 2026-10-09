// Navbar "hard refresh": shows a short, smooth loading modal, throws away what
// the browser has cached for this app, and reloads the page onto the latest
// version. For when something looks stale or stuck after a deploy.
//
// What "hard" means here, in order, while the modal plays:
//   1. the in-memory data cache (React Query) is emptied, so nothing old is shown
//      after the reload;
//   2. any service workers and Cache Storage entries are removed;
//   3. the page document itself is re-fetched bypassing the HTTP cache
//      (`cache: "reload"`) — built JS/CSS files are content-hashed, so a fresh
//      document is all that's needed to pick up a new deploy.
// Deliberately NOT cleared: sessionStorage / localStorage — the sign-in, the
// "intro already played" flag and the theme survive, so a refresh never signs
// anyone out or replays the intro.
//
// The modal is cheap to animate (opacity, transforms only — same rules as the
// role-switch modal) and respects "Interface animations" in Settings.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/lib/session";

const STEPS = ["Clearing cached data", "Fetching the latest version", "Reloading"];
const RUN_MS = 1800;
const RUN_REDUCED_MS = 500;

type Phase = "idle" | "in" | "running";

export function HardRefreshButton() {
  const queryClient = useQueryClient();
  const { data: account } = useCurrentAccount();
  const animate = account?.animations_enabled ?? true;
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [barStarted, setBarStarted] = useState(false);
  const durationMs = animate ? RUN_MS : RUN_REDUCED_MS;

  async function clearBrowserCaches() {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Best effort — the reload below still happens.
    }
  }

  async function handleClick() {
    if (phase !== "idle") return;
    setPhase("in");
    const started = Date.now();

    queryClient.clear();
    await clearBrowserCaches();
    try {
      // Refreshes the browser's stored copy of this page so the reload below
      // pulls the newest document instead of a cached one.
      await fetch(window.location.href, { cache: "reload", credentials: "same-origin" });
    } catch {
      // Offline or blocked: reload anyway.
    }

    // Keep the modal up for its full, deliberate length before reloading.
    const remaining = Math.max(0, durationMs - (Date.now() - started));
    window.setTimeout(() => window.location.reload(), remaining);
  }

  // Fade the modal in and start the progress bar one frame after it mounts, so
  // both transitions have a starting state to animate from.
  useEffect(() => {
    if (phase !== "in") return;
    const frame = requestAnimationFrame(() => {
      setPhase("running");
      setBarStarted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Walk the status line across the whole run (a handful of ticks, not per frame).
  const running = phase !== "idle";
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      Math.max(350, durationMs / STEPS.length),
    );
    return () => window.clearInterval(interval);
  }, [running, durationMs]);

  const active = phase !== "idle";

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={active}
        aria-label="Hard refresh"
        title="Hard refresh — clear cached data and reload"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>

      {active &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-4"
            style={{
              opacity: phase === "running" ? 1 : 0,
              transition: animate ? "opacity 260ms ease-out" : "none",
            }}
            role="status"
            aria-live="polite"
            aria-label="Refreshing"
          >
            <div
              className="flex w-full max-w-[20rem] flex-col items-center gap-5 rounded-2xl border border-white/10 px-8 py-8 text-center text-white shadow-2xl"
              style={{
                background: "linear-gradient(160deg, #1e4761 0%, #183445 55%, #112936 100%)",
                transform: phase === "running" ? "scale(1)" : "scale(0.95)",
                transition: animate ? "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
              }}
            >
              <div className="relative flex h-16 w-16 items-center justify-center">
                <svg
                  viewBox="0 0 64 64"
                  className={`absolute inset-0 h-full w-full ${animate ? "animate-spin" : ""}`}
                  style={animate ? { animationDuration: "1.4s" } : undefined}
                  aria-hidden="true"
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#fff"
                    strokeOpacity="0.15"
                    strokeWidth="3"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#72b360"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="52 124"
                  />
                </svg>
                <RefreshCw className="h-5 w-5 text-white" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-base font-semibold tracking-tight">Refreshing</h2>
                {/* Stacked lines cross-fade (opacity only) instead of swapping text. */}
                <div className="relative h-5 w-56 max-w-full">
                  {STEPS.map((label, i) => (
                    <p
                      key={label}
                      className="absolute inset-0 text-sm text-white/70"
                      style={{
                        opacity: i === step ? 1 : 0,
                        transition: animate ? "opacity 300ms ease" : "none",
                      }}
                    >
                      {label}…
                    </p>
                  ))}
                </div>
              </div>

              <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full w-full origin-left rounded-full bg-[#72b360]"
                  style={{
                    transform: barStarted ? "scaleX(1)" : "scaleX(0)",
                    transition: `transform ${durationMs}ms cubic-bezier(0.3, 0.05, 0.25, 1)`,
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
