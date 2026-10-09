// The post-login entrance: the 7-second TGO intro plays full-screen once per
// sign-in, THEN the app appears. "Once per sign-in" is a sessionStorage flag —
// it survives page reloads and navigation within the tab, is cleared on sign
// out (see app-shell.tsx) so the next login gets the intro again, and
// naturally resets when the tab is closed.
//
// Why the app is held back (IntroGate renders its children only after the
// video): the Dashboard's charts, count-ups and circuit animations used to
// render underneath the playing video and fought it for the main thread —
// that was the lag. Now the page does nothing but play the video; the app
// mounts the moment it ends, behind a still-opaque black cover that fades off
// after the first render has settled, so the reveal is clean too.
//
// Playback is preloaded: the video only starts once the browser reports it
// can play through (`canplaythrough`), so it never stutters mid-way. It never
// traps anyone: double tap / double click to skip, Esc, an automatic exit if the video errors, is
// blocked from autoplaying, or hasn't become playable in a few seconds. It is
// skipped entirely when the account has switched "Welcome intro" off in
// Settings (Account.show_intro, on by default), or the OS asks for reduced
// motion.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export const INTRO_SESSION_KEY = "tgo-intro-played";
const INTRO_SRC = "/tgo-intro.mp4";
const FADE_MS = 500;
// The cover stays fully opaque this long after the app mounts, so the app's
// first (heaviest) render happens out of sight instead of mid-fade.
const SETTLE_MS = 250;
const READY_TIMEOUT_MS = 8000;
// Double-tap / double-click to skip: two taps within this window and this
// distance of each other. Handled with pointer events (not `dblclick`) so it
// behaves the same on touch screens, where dblclick is unreliable.
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 48;
// How long the "double tap to skip" hint stays visible once the video starts.
const HINT_VISIBLE_MS = 4500;

type Phase = "checking" | "loading" | "playing" | "revealing" | "done";

function markPlayed() {
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    // Storage blocked — the intro may replay on reload, which is harmless.
  }
}

export function IntroGate({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    let alreadyPlayed = false;
    try {
      alreadyPlayed = sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    } catch {
      // ignore
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(alreadyPlayed || !enabled || reducedMotion ? "done" : "loading");
  }, [enabled]);

  const finish = useCallback(() => {
    markPlayed();
    setPhase((current) => (current === "loading" || current === "playing" ? "revealing" : current));
  }, []);

  // revealing -> done once the cover has settled and faded.
  useEffect(() => {
    if (phase !== "revealing") return;
    const timer = window.setTimeout(() => setPhase("done"), SETTLE_MS + FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Esc to skip, and a failsafe so a video that never becomes playable can't
  // leave a black screen over the app.
  useEffect(() => {
    if (phase !== "loading" && phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    const failsafe = window.setTimeout(() => {
      if (phase === "loading") finish();
    }, READY_TIMEOUT_MS);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(failsafe);
    };
  }, [phase, finish]);

  // The skip hint shows for a few seconds after the video starts, then fades.
  useEffect(() => {
    if (phase !== "playing") return;
    setHintVisible(true);
    const timer = window.setTimeout(() => setHintVisible(false), HINT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function handlePointerUp(event: React.PointerEvent) {
    if (phase !== "playing") return;
    const now = Date.now();
    const previous = lastTap.current;
    if (
      previous &&
      now - previous.time <= DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_SLOP_PX
    ) {
      lastTap.current = null;
      finish();
      return;
    }
    lastTap.current = { time: now, x: event.clientX, y: event.clientY };
  }

  const appVisible = phase === "revealing" || phase === "done";
  const coverVisible = phase === "loading" || phase === "playing" || phase === "revealing";

  return (
    <>
      {appVisible ? children : null}
      {coverVisible && (
        <div
          className="fixed inset-0 z-[100] select-none overflow-hidden bg-black"
          onPointerUp={handlePointerUp}
          style={{
            // Stops the browser treating the double tap as a zoom gesture.
            touchAction: "manipulation",
            opacity: phase === "revealing" ? 0 : 1,
            transition:
              phase === "revealing" ? `opacity ${FADE_MS}ms ease-out ${SETTLE_MS}ms` : "none",
            pointerEvents: phase === "revealing" ? "none" : "auto",
          }}
          role="dialog"
          aria-label="Welcome to TGO Workforce"
        >
          <video
            ref={videoRef}
            src={INTRO_SRC}
            // object-cover: edge-to-edge, no letterboxing.
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: phase === "loading" ? 0 : 1 }}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            onCanPlayThrough={() => {
              if (phase !== "loading") return;
              setPhase("playing");
              void videoRef.current?.play().catch(finish);
            }}
            onEnded={finish}
            onError={finish}
          />
          {/* A quiet hint, not a button: skipping is a double tap / double click
              anywhere on the video (or Esc). Fades out after a few seconds. */}
          {phase === "playing" && (
            <p
              className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs tracking-wide text-white/60 transition-opacity duration-700"
              style={{ opacity: hintVisible ? 1 : 0 }}
            >
              Double tap to skip
            </p>
          )}
        </div>
      )}
    </>
  );
}
