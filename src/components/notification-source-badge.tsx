// Marks a notification as coming from the Onboarding & Offboarding Platform
// rather than from Workforce itself, so it stands out in the bell and on the
// Notifications page.

import { DoorOpen } from "lucide-react";

import { ONBOARDING_PORTAL_LABEL, ONBOARDING_PORTAL_SOURCE } from "@/lib/portal";
import { cn } from "@/lib/utils";

export function isPortalSource(source: string | null | undefined): boolean {
  return source === ONBOARDING_PORTAL_SOURCE;
}

export function NotificationSourceBadge({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}) {
  if (!isPortalSource(source)) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-sidebar px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground",
        className,
      )}
    >
      <DoorOpen className="size-3 text-sidebar-primary" aria-hidden="true" />
      {ONBOARDING_PORTAL_LABEL}
    </span>
  );
}
