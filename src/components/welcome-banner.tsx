// A branded dashboard greeting with account preferences and session dismissal.
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
      className="relative isolate overflow-hidden rounded-xl border border-sidebar-border bg-sidebar px-4 py-4 text-sidebar-foreground shadow-[0_2px_8px_-4px_rgb(0_0_0/0.12)] sm:px-5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-linear-to-b from-sidebar-primary/80 to-sidebar-primary/30"
      />
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 360 120"
        fill="none"
        className="pointer-events-none absolute -top-5 right-[24%] -z-10 hidden h-32 w-96 text-sidebar-foreground opacity-[0.12] lg:block"
      >
        <circle cx="240" cy="60" r="46" stroke="currentColor" />
        <circle cx="240" cy="60" r="68" stroke="currentColor" />
        <ellipse cx="240" cy="60" rx="22" ry="46" stroke="currentColor" />
        <path
          d="M194 60h92M201 36h78M201 84h78M0 60h170l24-24M72 100h97l25-16M126 20h43l25 16"
          stroke="currentColor"
        />
        <circle cx="72" cy="100" r="3" fill="currentColor" />
        <circle cx="126" cy="20" r="3" fill="currentColor" />
      </svg>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 pr-8 sm:pr-0">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sidebar-primary shadow-sm ring-4 ring-white/5">
            <Hand className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug">Welcome back, {name}</h2>
            <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/75">
              {today} · {ROLE_LABELS[account.role]}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-white"
          >
            <Link to="/settings">
              <Settings className="size-3.5" />
              Settings
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/20 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white"
          >
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
        className="absolute right-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
