// The post-login entrance: the 7-second TGO intro plays full-screen once per
// sign-in, then fades into the app. "Once per sign-in" is a sessionStorage
// flag — it survives page reloads and navigation within the tab, is cleared
// on sign out (see app-shell.tsx) so the next login gets the intro again, and
// naturally resets when the tab is closed.
//
// It never traps anyone: Skip button + Esc, an automatic exit if the video
// errors, is blocked from autoplaying, or hasn't started within a few
// seconds. It is skipped entirely when the account has turned "Interface
// animations" off in Settings, or the OS asks for reduced motion. The app
// renders (and loads its data) underneath, so it's ready when the video ends.

import { useCallback, useEffect, useRef, useState } from "react";

export const INTRO_SESSION_KEY = "tgo-intro-played";
const INTRO_SRC = "/tgo-intro.mp4";
const FADE_MS = 450;
const START_TIMEOUT_MS = 5000;

type Phase = "checking" | "playing" | "fading" | "done";

function markPlayed() {
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    // Storage blocked — the intro may replay on reload, which is harmless.
  }
}

export function IntroOverlay({ enabled }: { enabled: boolean }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const videoRef = useRef<HTMLVideoElement>(null);
  const started = useRef(false);

  useEffect(() => {
    let alreadyPlayed = false;
    try {
      alreadyPlayed = sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    } catch {
      // ignore
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(alreadyPlayed || !enabled || reducedMotion ? "done" : "playing");
  }, [enabled]);

  const finish = useCallback(() => {
    markPlayed();
    setPhase((current) => (current === "playing" ? "fading" : current));
  }, []);

  useEffect(() => {
    if (phase !== "fading") return;
    const timer = window.setTimeout(() => setPhase("done"), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    // If playback never begins (blocked autoplay, stalled network), don't
    // leave a black screen over the app.
    const failsafe = window.setTimeout(() => {
      if (!started.current) finish();
    }, START_TIMEOUT_MS);
    const video = videoRef.current;
    void video?.play().catch(finish);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(failsafe);
    };
  }, [phase, finish]);

  if (phase === "checking" || phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity ease-out"
      style={{ opacity: phase === "fading" ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
      role="dialog"
      aria-label="Welcome to TGO Workforce"
    >
      <video
        ref={videoRef}
        src={INTRO_SRC}
        className="h-full w-full object-contain"
        autoPlay
        muted
        playsInline
        preload="auto"
        onPlaying={() => {
          started.current = true;
        }}
        onEnded={finish}
        onError={finish}
      />
      <button
        type="button"
        onClick={finish}
        className="absolute bottom-6 right-6 cursor-pointer rounded-full border border-white/25 bg-black/40 px-4 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white"
      >
        Skip
      </button>
    </div>
  );
}
