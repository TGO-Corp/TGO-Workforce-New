// Tiny status next to a page's saved filters: "Saving…" while the change is
// being stored on the account, a brief "Saved" tick afterwards. Renders nothing
// the rest of the time, so the toolbar stays quiet.

import { Check, CircleAlert, Loader2 } from "lucide-react";

import type { SaveStatus } from "@/lib/use-saved-milestone-filters";

export function SavedFiltersIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
    >
      {status === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Saved to your
          account
        </>
      )}
      {status === "error" && (
        <>
          <CircleAlert className="h-3.5 w-3.5 text-destructive" /> Not saved
        </>
      )}
    </span>
  );
}
