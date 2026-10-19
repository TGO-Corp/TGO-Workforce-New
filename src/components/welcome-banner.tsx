// A quiet dashboard greeting with account preferences and session dismissal.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Hand, Settings, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";

export const WELCOME_SESSION_KEY = "tgo-welcome-dismissed";

export function WelcomeBanner() {
  const { data: account } = useCurrentAccount();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
    } catch {
      /* Show the greeting when storage is unavailable. */
    }
    setVisible(!dismissed);
  }, []);

  function close() {
    try {
      sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
    } catch {
      /* Dismissal still works for this visit. */
    }
    setVisible(false);
  }

  if (!account || !visible) return null;
  const name = account.first_name || account.display_name || account.email.split("@")[0] || "there";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section
      aria-label="Welcome"
      className="relative rounded-xl border border-border/80 bg-card px-4 py-4 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 pr-8 sm:pr-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Hand className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug">Welcome back, {name}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {today} · {ROLE_LABELS[account.role]}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            <Link to="/settings">
              <Settings className="size-3.5" />
              Settings
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="shadow-none">
            <Link to="/settings" hash="dashboard-cards">
              <SlidersHorizontal className="size-3.5" />
              Personalize
            </Link>
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss welcome message"
        className="absolute right-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
