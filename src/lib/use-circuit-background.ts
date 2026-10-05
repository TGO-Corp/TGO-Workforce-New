// Hook wrapper around circuit-art.ts for the components that wear the dark
// circuit band (MetricCard's header, ui/table's TableHeader, ui/dialog's
// DialogHeader). Picks the animated or the static rendering of the art:
// static when the signed-in account has turned animations off in Settings
// (same preference MetricCard's count-up and the page transitions honour) or
// the OS asks for reduced motion.

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { circuitBackgroundStyle, type CircuitVariant } from "@/lib/circuit-art";
import { useCurrentAccount } from "@/lib/session";

export function useCircuitBackground(
  variant: CircuitVariant,
  seed: string,
  /** False freezes the art (e.g. scrolled offscreen) — see useCircuitBand. */
  active = true,
): CSSProperties {
  const { data: account } = useCurrentAccount();
  const [reducedMotion, setReducedMotion] = useState(false);

  // Read in an effect (not during render) so server and first client render
  // agree — the art simply starts animated and settles to static if needed.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const animated = active && (account?.animations_enabled ?? true) && !reducedMotion;
  return useMemo(() => circuitBackgroundStyle(variant, seed, animated), [variant, seed, animated]);
}

/** useCircuitBackground plus an IntersectionObserver: the band only animates
 * while it is actually on screen, so a long page of cards/tables repaints only
 * what the user can see. Attach `setRef` to the same element that gets
 * `style`. */
export function useCircuitBand(variant: CircuitVariant, seed: string) {
  const [el, setEl] = useState<Element | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  const style = useCircuitBackground(variant, seed, visible);
  return { setRef: setEl, style };
}
