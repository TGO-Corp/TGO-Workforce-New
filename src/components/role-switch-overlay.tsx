// Full-screen loading screen shown while a Super Admin enters or leaves a
// sandbox role (state lives in lib/role-switch.ts, driven by the sandbox hooks
// in lib/session.ts). The app re-renders under the new role while this covers
// it, and it fades away once that has settled.
//
// Built to be cheap: every moving part is a CSS transform or opacity change
// (rotating rings, pulsing icon, the progress bar's scaleX, the cross-fading
// status line), so it stays on the compositor and never repaints the page. No
// blur/backdrop filters, no per-frame JS — the status line advances on a
// timer a few times over the whole animation, not per frame.

import { useEffect, useState } from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";

import { ROLE_LABELS } from "@/lib/roles";
import { ROLE_SWITCH_CLOSE_MS, useRoleSwitch } from "@/lib/role-switch";
import { useCurrentAccount } from "@/lib/session";

const STEPS = [
  "Securing your session",
  "Applying role permissions",
  "Rebuilding navigation",
  "Preparing your workspace",
  "Almost there",
];

export function RoleSwitchOverlay() {
  const { phase, target, durationMs } = useRoleSwitch();
  const { data: account } = useCurrentAccount();
  const animate = account?.animations_enabled ?? true;
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);

  const active = phase !== "idle";

  // Kick the progress bar one frame after mount so its transition has a
  // starting point, and walk the status line across the whole duration.
  useEffect(() => {
    if (phase === "idle") {
      setStarted(false);
      setStep(0);
      return;
    }
    if (phase !== "active") return;
    const frame = requestAnimationFrame(() => setStarted(true));
    const interval = window.setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      Math.max(400, durationMs / STEPS.length),
    );
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [phase, durationMs]);

  if (!active || !target) return null;

  const title =
    target.kind === "enter"
      ? `Switching to ${ROLE_LABELS[target.role]}`
      : `Returning to ${ROLE_LABELS.super_admin}`;
  const Icon = target.kind === "enter" ? FlaskConical : ShieldCheck;
  const closing = phase === "closing";

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-7 bg-[#0f2430] px-6 text-center text-white"
      style={{
        opacity: closing ? 0 : 1,
        transition: `opacity ${ROLE_SWITCH_CLOSE_MS}ms ease-out`,
        background: "radial-gradient(ellipse at 50% 40%, #1e4761 0%, #14303f 45%, #0c1d27 100%)",
      }}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="relative flex h-32 w-32 items-center justify-center">
        <svg
          viewBox="0 0 128 128"
          className={`absolute inset-0 h-full w-full ${animate ? "animate-spin" : ""}`}
          style={
            animate ? { animationDuration: "9s", animationTimingFunction: "linear" } : undefined
          }
          aria-hidden="true"
        >
          <circle
            cx="64"
            cy="64"
            r="58"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.22"
            strokeWidth="3"
            strokeDasharray="1.5 7"
            strokeLinecap="round"
          />
        </svg>
        <svg
          viewBox="0 0 128 128"
          className={`absolute inset-0 h-full w-full ${animate ? "animate-spin" : ""}`}
          style={
            animate
              ? {
                  animationDuration: "4.2s",
                  animationTimingFunction: "linear",
                  animationDirection: "reverse",
                }
              : undefined
          }
          aria-hidden="true"
        >
          <circle
            cx="64"
            cy="64"
            r="44"
            fill="none"
            stroke="#72b360"
            strokeOpacity="0.85"
            strokeWidth="2"
            strokeDasharray="46 18 8 18"
            strokeLinecap="round"
          />
        </svg>
        <Icon className={`h-9 w-9 text-white ${animate ? "animate-pulse" : ""}`} />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {/* Stacked lines cross-fade (opacity only) instead of swapping text. */}
        <div className="relative h-5 w-72 max-w-full">
          {STEPS.map((label, i) => (
            <p
              key={label}
              className="absolute inset-0 text-sm text-white/70"
              style={{
                opacity: i === step ? 1 : 0,
                transition: animate ? "opacity 350ms ease" : "none",
              }}
            >
              {label}…
            </p>
          ))}
        </div>
      </div>

      <div className="h-1 w-64 max-w-full overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full w-full origin-left rounded-full bg-[#72b360]"
          style={{
            transform: closing ? "scaleX(1)" : started ? "scaleX(0.94)" : "scaleX(0)",
            transition: closing
              ? "transform 250ms ease-out"
              : `transform ${durationMs}ms cubic-bezier(0.3, 0.05, 0.25, 1)`,
          }}
        />
      </div>
    </div>
  );
}
