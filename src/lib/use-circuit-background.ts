// Hook wrapper around circuit-art.ts for the components that wear the dark
// circuit band (MetricCard's header, ui/table's TableHeader, ui/dialog's
// DialogHeader). Picks the animated or the static rendering of the art:
// static when the signed-in account has turned animations off in Settings
// (same preference MetricCard's count-up and the page transitions honour) or
// the OS asks for reduced motion.

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { circuitBackgroundStyle, type CircuitVariant } from "@/lib/circuit-art";
import { useCurrentAccount } from "@/lib/session";

export function useCircuitBackground(variant: CircuitVariant, seed: string): CSSProperties {
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

  const animated = (account?.animations_enabled ?? true) && !reducedMotion;
  return useMemo(() => circuitBackgroundStyle(variant, seed, animated), [variant, seed, animated]);
}
