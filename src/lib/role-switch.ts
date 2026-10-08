// Tiny external store backing the small "switching role" loading modal
// (see components/role-switch-overlay.tsx). A Super Admin entering or leaving a
// sandbox role re-renders the whole app under a different set of permissions;
// this keeps a deliberate, longer loading screen up for that moment instead of
// the app visibly reshuffling itself.
//
// Kept outside React state on purpose: the sandbox mutations live in
// lib/session.ts hooks (called from several components), and the overlay needs
// to outlive any one of them re-rendering.

import { useSyncExternalStore } from "react";

import type { AccountRole } from "@/lib/session";

export type RoleSwitchTarget = { kind: "enter"; role: AccountRole } | { kind: "exit" };
export type RoleSwitchPhase = "idle" | "active" | "closing";

export type RoleSwitchState = {
  phase: RoleSwitchPhase;
  target: RoleSwitchTarget | null;
  /** How long the loading animation is meant to run — the overlay's progress
   * bar is timed to this. */
  durationMs: number;
};

/** The "long" loading screen. Shortened to a brief cover when the person has
 * interface animations off. */
export const ROLE_SWITCH_MIN_MS = 2800;
export const ROLE_SWITCH_REDUCED_MS = 600;
/** The overlay's fade-out, after the new role is already rendered beneath it. */
export const ROLE_SWITCH_CLOSE_MS = 450;

const IDLE: RoleSwitchState = { phase: "idle", target: null, durationMs: 0 };

let state: RoleSwitchState = IDLE;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: RoleSwitchState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function beginRoleSwitch(target: RoleSwitchTarget, durationMs: number) {
  if (closeTimer) clearTimeout(closeTimer);
  set({ phase: "active", target, durationMs });
}

/** Fades the overlay out (or drops it at once after a failure). */
export function endRoleSwitch(immediate = false) {
  if (state.phase === "idle") return;
  if (closeTimer) clearTimeout(closeTimer);
  if (immediate) {
    set(IDLE);
    return;
  }
  set({ ...state, phase: "closing" });
  closeTimer = setTimeout(() => set(IDLE), ROLE_SWITCH_CLOSE_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoleSwitch(): RoleSwitchState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
