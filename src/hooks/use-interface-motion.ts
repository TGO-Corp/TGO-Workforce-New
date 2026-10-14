import { useEffect, useState } from "react";
import { useCurrentAccount } from "@/lib/session";

// Start static during hydration; honor account and operating-system preferences.
export function useInterfaceMotion() {
  const { data: account } = useCurrentAccount();
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return (account?.animations_enabled ?? true) && !reduced;
}

// Play a short entrance once; polling and filter updates remain immediately readable.
export function useChartMotion() {
  const enabled = useInterfaceMotion();
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!enabled || finished) return;
    const timer = window.setTimeout(() => setFinished(true), 450);
    return () => window.clearTimeout(timer);
  }, [enabled, finished]);
  return enabled && !finished;
}
