import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  // Seed local form state from the account exactly once — after that, this
  // page's own edits are the source of truth, so a background refetch of
  // /auth/me (the 60s staleTime query other pages also share) can't quietly
  // discard something you're mid-way through changing.
  const seeded = useRef(false);

  useEffect(() => {
    if (!account || seeded.current) return;
    seeded.current = true;
    setDefaultOffice(account.default_office ?? NO_DEFAULT);
    setNotifyAnniversaries(account.notify_anniversaries);
    setNotifyBirthdays(account.notify_birthdays);
    setNotifyNewHires(account.notify_new_hires);
    setNotifyOnViolationReview(account.notify_on_violation_review);
    setNotifyOnNewHireAdded(account.notify_on_new_hire_added);
    setNotifyOnHmoMemberAdded(account.notify_on_hmo_member_added);
    setAnimationsEnabled(account.animations_enabled);
  }, [account]);

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
      animationsEnabled !== account.animations_enabled);

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
    };
    updatePreferences.mutate(patch, {
      onSuccess: () => toast.success("Settings saved"),
      onError: () => toast.error("Couldn't save settings. Please try again."),
    });
  }

  // Workspace and Appearance are both short, single-control cards — stacked
  // in one column (instead of forced to h-full match whatever's next to
  // them) so each sizes to its own content instead of leaving a wall of
  // empty space below a two-line Select.
  const workspaceCard = (
    <Card key="workspace">
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>
          Torero Global Outsourcing HR Operations — internal operations portal. Your default office
          pre-fills the New Hire form's office picker.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:max-w-xs">
          <Label>Default office</Label>
          <Select value={defaultOffice} onValueChange={setDefaultOffice} disabled={isLoading}>
            <SelectTrigger>
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
        </div>
      </CardContent>
    </Card>
  );

  const appearanceCard = (
    <Card key="appearance">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Visual effects shown across the app — only affects your own view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-28 items-start justify-between gap-4 rounded-md border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium">Interface animations</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Page transitions, animated counters on dashboard numbers, and the moving circuit lines
              on card, table, modal and sidebar headers. Turn off for a snappier, static interface —
              saved to your account, so it follows you across devices.
            </p>
          </div>
          <Switch
            checked={animationsEnabled}
            onCheckedChange={setAnimationsEnabled}
            disabled={isLoading}
            className="shrink-0"
          />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace defaults and notification preferences for your account."
      />

      <div
        className={
          showNotificationInbox ? "grid gap-4 lg:grid-cols-3" : "grid gap-4 sm:grid-cols-2"
        }
      >
        <div className="flex flex-col gap-4">
          {workspaceCard}
          {appearanceCard}
        </div>

        {showNotificationInbox && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notification Inbox</CardTitle>
              <CardDescription>
                What lands in your bell icon at the top of the page. Shown only for the modules your
                role can act on.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {showViolationReviewToggle && (
                <div className="flex min-h-28 items-start justify-between gap-4 rounded-md border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-medium">Violation ready for review</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Notify me when a violation email is prepared and waiting on HR approval, or
                      when a send fails.
                    </p>
                  </div>
                  <Switch
                    checked={notifyOnViolationReview}
                    onCheckedChange={setNotifyOnViolationReview}
                    disabled={isLoading}
                    className="shrink-0"
                  />
                </div>
              )}
              {showNewHireToggle && (
                <div className="flex min-h-28 items-start justify-between gap-4 rounded-md border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-medium">New hire added</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Notify me when someone adds a new hire to the onboarding tracker.
                    </p>
                  </div>
                  <Switch
                    checked={notifyOnNewHireAdded}
                    onCheckedChange={setNotifyOnNewHireAdded}
                    disabled={isLoading}
                    className="shrink-0"
                  />
                </div>
              )}
              {showHmoToggle && (
                <div className="flex min-h-28 items-start justify-between gap-4 rounded-md border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-medium">HMO member added</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Notify me when someone adds a new member to HMO Management.
                    </p>
                  </div>
                  <Switch
                    checked={notifyOnHmoMemberAdded}
                    onCheckedChange={setNotifyOnHmoMemberAdded}
                    disabled={isLoading}
                    className="shrink-0"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={showNotificationInbox ? "lg:col-span-3" : "sm:col-span-2"}>
          <CardHeader>
            <CardTitle>Dashboard Cards</CardTitle>
            <CardDescription>
              What your Dashboard surfaces. Turning one off hides the matching card there — it only
              affects your own view, not anyone else's.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  {
                    title: "Anniversary reminders",
                    desc: "Show upcoming work anniversaries on your Dashboard.",
                    checked: notifyAnniversaries,
                    onChange: setNotifyAnniversaries,
                  },
                  {
                    title: "Birthday reminders",
                    desc: "Show a heads-up on your Dashboard when a birthday falls this week.",
                    checked: notifyBirthdays,
                    onChange: setNotifyBirthdays,
                  },
                  {
                    title: "New hire alerts",
                    desc: "Show recently added employees on your Dashboard.",
                    checked: notifyNewHires,
                    onChange: setNotifyNewHires,
                  },
                ] satisfies {
                  title: string;
                  desc: string;
                  checked: boolean;
                  onChange: (v: boolean) => void;
                }[]
              ).map((row) => (
                <div
                  key={row.title}
                  className="flex min-h-32 items-start justify-between gap-4 rounded-md border bg-muted/20 p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.desc}</p>
                  </div>
                  <Switch
                    checked={row.checked}
                    onCheckedChange={row.onChange}
                    disabled={isLoading}
                    className="shrink-0"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={!dirty || updatePreferences.isPending}>
          {updatePreferences.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
