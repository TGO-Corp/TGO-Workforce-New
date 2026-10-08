// The Anniversaries / Birthdays pages' filters (month arrangement, office, time
// range), saved on the signed-in ACCOUNT rather than in the browser, so a
// person's choice follows them to any device and survives a reload.
//
// Behaviour:
//   * starts from the defaults, then adopts what's saved on the account once it
//     loads (and only then — a background refetch never overwrites a choice
//     they're in the middle of making);
//   * any change is saved automatically ~0.6s after the last tweak;
//   * `status` drives the small "Saving… / Saved" indicator next to the filters.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { OFFICES, type MilestoneTimeFilter, type MonthArrangement } from "@/data/employees";
import {
  useCurrentAccount,
  useUpdateMyPreferences,
  type MilestoneFilterPrefs,
} from "@/lib/session";

export type SavedFiltersPage = "anniversaries" | "birthdays";
export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEFAULTS: MilestoneFilterPrefs = { arrangement: "calendar", office: "all", time: "all" };
const SAVE_DELAY_MS = 600;
const SAVED_VISIBLE_MS = 2200;

/** An office that no longer exists falls back to "all" instead of an empty page. */
function sanitize(prefs: MilestoneFilterPrefs): MilestoneFilterPrefs {
  const officeOk = prefs.office === "all" || (OFFICES as readonly string[]).includes(prefs.office);
  return { ...prefs, office: officeOk ? prefs.office : "all" };
}

function same(a: MilestoneFilterPrefs, b: MilestoneFilterPrefs) {
  return a.arrangement === b.arrangement && a.office === b.office && a.time === b.time;
}

export function useSavedMilestoneFilters(page: SavedFiltersPage) {
  const { data: account } = useCurrentAccount();
  const update = useUpdateMyPreferences();
  const [filters, setFilters] = useState<MilestoneFilterPrefs>(DEFAULTS);
  // Flips to true in the same render that adopts the saved values — the save
  // effect below waits for it, so the (still default) first render can never be
  // mistaken for a change and overwrite what's saved.
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const seeded = useRef(false);
  const saved = account?.saved_filters?.[page];

  useEffect(() => {
    if (!account || seeded.current) return;
    seeded.current = true;
    if (saved) setFilters(sanitize(saved));
    setReady(true);
  }, [account, saved]);

  const mutate = update.mutate;
  useEffect(() => {
    if (!ready) return;
    if (same(filters, sanitize(saved ?? DEFAULTS))) return;
    setStatus("saving");
    const timer = window.setTimeout(() => {
      mutate(
        { saved_filters: { [page]: filters } },
        {
          onSuccess: () => setStatus("saved"),
          onError: () => {
            setStatus("error");
            toast.error("Couldn't save your filters. They'll reset next time you open the page.");
          },
        },
      );
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [filters, ready, saved, page, mutate]);

  // The "Saved" tick fades away on its own.
  useEffect(() => {
    if (status !== "saved") return;
    const timer = window.setTimeout(() => setStatus("idle"), SAVED_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const setArrangement = useCallback(
    (arrangement: MonthArrangement) => setFilters((f) => ({ ...f, arrangement })),
    [],
  );
  const setOffice = useCallback((office: string) => setFilters((f) => ({ ...f, office })), []);
  const setTime = useCallback(
    (time: MilestoneTimeFilter) => setFilters((f) => ({ ...f, time })),
    [],
  );

  return {
    arrangement: filters.arrangement,
    office: filters.office,
    time: filters.time,
    setArrangement,
    setOffice,
    setTime,
    status,
  };
}
