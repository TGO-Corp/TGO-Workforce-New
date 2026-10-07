import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  Bell,
  Building2,
  Cake,
  ClipboardCheck,
  Film,
  HeartPulse,
  LayoutDashboard,
  Palette,
  Play,
  ShieldAlert,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { BandedCardHeader } from "@/components/banded-card-header";
import { INTRO_SESSION_KEY } from "@/components/intro-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OFFICES } from "@/data/employees";
import { useCurrentAccount, useUpdateMyPreferences, type PreferencesPatch } from "@/lib/session";
import { canApproveAttendance, canManageBenefits, canManageOnboarding } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Configure workspace defaults and notification preferences for HR Operations.",
      },
      { property: "og:title", content: "Settings — Torero Global Outsourcing HR Operations" },
      {
        property: "og:description",
        content: "Workspace preferences for the Torero Global Outsourcing HR Operations portal.",
      },
    ],
  }),
  component: SettingsPage,
});

// Sentinel Select value for "no default office" — Radix Select can't take an
// empty string as an item value.
const NO_DEFAULT = "none";

// Only accounts that could ever actually receive each in-app notification
// see its toggle — showing "notify me when a violation needs review" to
// someone who can never be notified about that would just be a confusing
// dead switch. Driven by the same permissions the backend's
// notify_permission_holders() call actually checks (see
// Permission.ATTENDANCE_APPROVE / ONBOARDING_MANAGE in
// backend/app/api/routes/violations.py and new_hires.py) rather than a
// hardcoded role list, so a Super Admin granting these permissions to a
// different role makes the toggle appear for them too, with no redeploy.

/** One labelled setting: icon chip, title + description on the left, the
 * control (switch, select, button) on the right. Rows stack inside a section
 * card separated by hairlines. */
function SettingRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:justify-end">{children}</div>
    </div>
  );
}

/** A titled section card: the dark circuit header, then its rows. `id` is the
 * anchor the left-hand section nav scrolls to. */
function SettingsSection({
  id,
  seed,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  seed: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 overflow-hidden">
      <BandedCardHeader seed={seed}>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </BandedCardHeader>
      <CardContent className="divide-y p-0">{children}</CardContent>
    </Card>
  );
}

function SettingsPage() {
  const { data: account, isLoading } = useCurrentAccount();
  const updatePreferences = useUpdateMyPreferences();

  const [defaultOffice, setDefaultOffice] = useState<string>(NO_DEFAULT);
  const [notifyAnniversaries, setNotifyAnniversaries] = useState(true);
  const [notifyBirthdays, setNotifyBirthdays] = useState(true);
  const [notifyNewHires, setNotifyNewHires] = useState(true);
  const [notifyOnViolationReview, setNotifyOnViolationReview] = useState(true);
  const [notifyOnNewHireAdded, setNotifyOnNewHireAdded] = useState(true);
  const [notifyOnHmoMemberAdded, setNotifyOnHmoMemberAdded] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  // Seed local form state from the account exactly once — after that, this
  // page's own edits are the source of truth, so a background refetch of
  // /auth/me (the 60s staleTime query other pages also share) can't quietly
  // discard something you're mid-way through changing.
  const seeded = useRef(false);

  // useState setters are stable, so this never changes identity.
  const applyAccountToForm = useCallback((a: NonNullable<typeof account>) => {
    setDefaultOffice(a.default_office ?? NO_DEFAULT);
    setNotifyAnniversaries(a.notify_anniversaries);
    setNotifyBirthdays(a.notify_birthdays);
    setNotifyNewHires(a.notify_new_hires);
    setNotifyOnViolationReview(a.notify_on_violation_review);
    setNotifyOnNewHireAdded(a.notify_on_new_hire_added);
    setNotifyOnHmoMemberAdded(a.notify_on_hmo_member_added);
    setAnimationsEnabled(a.animations_enabled);
    setShowIntro(a.show_intro ?? true);
  }, []);

  useEffect(() => {
    if (!account || seeded.current) return;
    seeded.current = true;
    applyAccountToForm(account);
  }, [account, applyAccountToForm]);

  const showViolationReviewToggle = canApproveAttendance(account?.permissions);
  const showNewHireToggle = canManageOnboarding(account?.permissions);
  const showHmoToggle = canManageBenefits(account?.permissions);
  const showNotificationInbox = showViolationReviewToggle || showNewHireToggle || showHmoToggle;

  const dirty =
    !!account &&
    (defaultOffice !== (account.default_office ?? NO_DEFAULT) ||
      notifyAnniversaries !== account.notify_anniversaries ||
      notifyBirthdays !== account.notify_birthdays ||
      notifyNewHires !== account.notify_new_hires ||
      notifyOnViolationReview !== account.notify_on_violation_review ||
      notifyOnNewHireAdded !== account.notify_on_new_hire_added ||
      notifyOnHmoMemberAdded !== account.notify_on_hmo_member_added ||
      animationsEnabled !== account.animations_enabled ||
      showIntro !== (account.show_intro ?? true));

  function handleSave() {
    const patch: PreferencesPatch = {
      default_office: defaultOffice === NO_DEFAULT ? null : defaultOffice,
      notify_anniversaries: notifyAnniversaries,
      notify_birthdays: notifyBirthdays,
      notify_new_hires: notifyNewHires,
      notify_on_violation_review: notifyOnViolationReview,
      notify_on_new_hire_added: notifyOnNewHireAdded,
      notify_on_hmo_member_added: notifyOnHmoMemberAdded,
      animations_enabled: animationsEnabled,
      show_intro: showIntro,
    };
    updatePreferences.mutate(patch, {
      onSuccess: () => toast.success("Settings saved"),
      onError: () => toast.error("Couldn't save settings. Please try again."),
    });
  }

  // Clears "already played this sign-in" and reloads, so the intro plays
  // straight away — a way to see it without signing out and back in.
  function previewIntro() {
    try {
      sessionStorage.removeItem(INTRO_SESSION_KEY);
    } catch {
      // ignore
    }
    window.location.assign("/");
  }

  const sections = [
    { id: "workspace", label: "Workspace", icon: Building2 },
    { id: "appearance", label: "Appearance", icon: Palette },
    ...(showNotificationInbox ? [{ id: "notifications", label: "Notifications", icon: Bell }] : []),
    { id: "dashboard-cards", label: "Dashboard Cards", icon: LayoutDashboard },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace defaults and notification preferences for your account."
      />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Section nav — sticky on wide screens, a wrapping chip row on
            narrow ones. Scrolls to the section rather than routing. */}
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {sections.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-6">
          <SettingsSection
            id="workspace"
            seed="settings-workspace"
            icon={Building2}
            title="Workspace"
            description="Torero Global Outsourcing HR Operations — internal operations portal."
          >
            <SettingRow
              icon={Building2}
              title="Default office"
              description="Pre-fills the office picker on the New Hire form."
            >
              <Select value={defaultOffice} onValueChange={setDefaultOffice} disabled={isLoading}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DEFAULT}>No default</SelectItem>
                  {OFFICES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </SettingsSection>

          <SettingsSection
            id="appearance"
            seed="settings-appearance"
            icon={Palette}
            title="Appearance"
            description="Visual effects shown across the app — only affects your own view."
          >
            <SettingRow
              icon={Sparkles}
              title="Interface animations"
              description="Page transitions, animated counters on dashboard numbers, and the moving circuit lines on card, table, modal and sidebar headers. Turn off for a snappier, static interface."
            >
              <Switch
                checked={animationsEnabled}
                onCheckedChange={setAnimationsEnabled}
                disabled={isLoading}
              />
            </SettingRow>
            <SettingRow
              icon={Film}
              title="Welcome intro"
              description="Play the short TGO intro video full-screen each time you sign in, before the dashboard appears. On by default."
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={previewIntro}
                disabled={isLoading || !showIntro || dirty}
                title={dirty ? "Save your changes first" : "Replay the intro now"}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" /> Preview
              </Button>
              <Switch checked={showIntro} onCheckedChange={setShowIntro} disabled={isLoading} />
            </SettingRow>
          </SettingsSection>

          {showNotificationInbox && (
            <SettingsSection
              id="notifications"
              seed="settings-notifications"
              icon={Bell}
              title="Notification Inbox"
              description="What lands in your bell icon at the top of the page. Shown only for the modules your role can act on."
            >
              {showViolationReviewToggle && (
                <SettingRow
                  icon={ShieldAlert}
                  title="Violation ready for review"
                  description="Notify me when a violation email is prepared and waiting on HR approval, or when a send fails."
                >
                  <Switch
                    checked={notifyOnViolationReview}
                    onCheckedChange={setNotifyOnViolationReview}
                    disabled={isLoading}
                  />
                </SettingRow>
              )}
              {showNewHireToggle && (
                <SettingRow
                  icon={ClipboardCheck}
                  title="New hire added"
                  description="Notify me when someone adds a new hire to the onboarding tracker."
                >
                  <Switch
                    checked={notifyOnNewHireAdded}
                    onCheckedChange={setNotifyOnNewHireAdded}
                    disabled={isLoading}
                  />
                </SettingRow>
              )}
              {showHmoToggle && (
                <SettingRow
                  icon={HeartPulse}
                  title="HMO member added"
                  description="Notify me when someone adds a new member to HMO Management."
                >
                  <Switch
                    checked={notifyOnHmoMemberAdded}
                    onCheckedChange={setNotifyOnHmoMemberAdded}
                    disabled={isLoading}
                  />
                </SettingRow>
              )}
            </SettingsSection>
          )}

          <SettingsSection
            id="dashboard-cards"
            seed="settings-dashboard-cards"
            icon={LayoutDashboard}
            title="Dashboard Cards"
            description="What your Dashboard surfaces. Turning one off hides the matching card there — it only affects your own view."
          >
            <SettingRow
              icon={Award}
              title="Anniversary reminders"
              description="Show upcoming work anniversaries on your Dashboard."
            >
              <Switch
                checked={notifyAnniversaries}
                onCheckedChange={setNotifyAnniversaries}
                disabled={isLoading}
              />
            </SettingRow>
            <SettingRow
              icon={Cake}
              title="Birthday reminders"
              description="Show a heads-up on your Dashboard when a birthday falls this week."
            >
              <Switch
                checked={notifyBirthdays}
                onCheckedChange={setNotifyBirthdays}
                disabled={isLoading}
              />
            </SettingRow>
            <SettingRow
              icon={UserPlus}
              title="New hire alerts"
              description="Show recently added employees on your Dashboard."
            >
              <Switch
                checked={notifyNewHires}
                onCheckedChange={setNotifyNewHires}
                disabled={isLoading}
              />
            </SettingRow>
          </SettingsSection>

          {/* Floating save bar — only present while there's something to
              save, so the page stays calm otherwise. */}
          <div
            className={cn(
              "sticky bottom-4 z-10 transition-all duration-200",
              dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
            )}
            aria-hidden={!dirty}
          >
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
              <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => account && applyAccountToForm(account)}
                  disabled={updatePreferences.isPending}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!dirty || updatePreferences.isPending}
                >
                  {updatePreferences.isPending ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
