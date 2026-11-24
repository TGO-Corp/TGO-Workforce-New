import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Cake,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Moon,
  Pencil,
  Search,
  ScrollText,
  ShieldCheck,
  Sun,
  Trophy,
  Upload,
  Award as AwardIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMyActivityLogs, type ActivitySeverity } from "@/data/activity-log-store";
import type { ActivityCategory, ActivityLogEntry } from "@/data/activity-log-store";
import { useAwards } from "@/data/award-store";
import { useEmployees } from "@/data/employee-store";
import { formatDate, formatYears, parseCalendarDate } from "@/data/employees";
import { useCurrentAccount, useUpdateMyPreferences, type Theme } from "@/lib/session";
import { applyTheme } from "@/lib/theme";
import { readAndResizeImage } from "@/lib/image-upload";
import { canViewAwards, PERMISSION_LABELS } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Your account details and personalization settings for HR Operations.",
      },
      { property: "og:title", content: "Profile — Torero Global Outsourcing HR Operations" },
      {
        property: "og:description",
        content: "Account identity and appearance preferences.",
      },
    ],
  }),
  component: ProfilePage,
});

const SEVERITY_VARIANT: Record<ActivitySeverity, "secondary" | "outline" | "destructive"> = {
  info: "secondary",
  warning: "outline",
  critical: "destructive",
};

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  Employee: "Employee Directory",
  Onboarding: "Onboarding",
  Attendance: "Attendance",
  Benefits: "HMO Management",
  Access: "Access & Security",
  Data: "Data",
  System: "System",
};

const ACTIVITY_CATEGORIES = Object.keys(CATEGORY_LABELS) as ActivityCategory[];
const ACTIVITY_PAGE_SIZE = 8;
type ActivityTimeFilter = "all" | "7" | "30" | "90";

function matchesTimeFilter(occurredAt: string, filter: ActivityTimeFilter): boolean {
  if (filter === "all") return true;
  const occurred = new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) return false;
  const days = Number(filter);
  return Date.now() - occurred.getTime() <= days * 86_400_000;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function EditProfileDialog({ displayName, photoUrl }: { displayName: string; photoUrl: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [photo, setPhoto] = useState(photoUrl);
  const [processingFile, setProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updatePreferences = useUpdateMyPreferences();

  function handleOpenChange(next: boolean) {
    if (next) {
      // Reset to the current saved values every time the dialog opens, so a
      // cancelled edit from last time doesn't linger in the form.
      setName(displayName);
      setPhoto(photoUrl);
    }
    setOpen(next);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // clear so picking the exact same file again still fires onChange
    if (!file) return;
    setProcessingFile(true);
    try {
      setPhoto(await readAndResizeImage(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't process that image.");
    } finally {
      setProcessingFile(false);
    }
  }

  function handleSave() {
    updatePreferences.mutate(
      { display_name: name.trim(), photo_url: photo.trim() || null },
      {
        onSuccess: () => {
          toast.success("Profile updated");
          setOpen(false);
        },
        onError: () => toast.error("Couldn't save your profile. Please try again."),
      },
    );
  }

  const isUploadedPhoto = photo.startsWith("data:");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" /> Personalize
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Personalize your profile</DialogTitle>
          <DialogDescription>
            Your display name and photo — visible to everyone else in HR Operations.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How your name shows up across the portal"
            />
          </div>

          <div className="grid gap-2">
            <Label>Profile photo</Label>
            <div className="flex items-start gap-3">
              <Avatar className="size-14 shrink-0">
                {photo && <AvatarImage src={photo} alt={name} />}
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Input
                  id="profile-photo"
                  value={isUploadedPhoto ? "" : photo}
                  onChange={(e) => setPhoto(e.target.value)}
                  placeholder={
                    isUploadedPhoto
                      ? "Uploaded photo — remove it to paste a URL instead"
                      : "https://... (link to an image)"
                  }
                  disabled={isUploadedPhoto}
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={processingFile}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {processingFile ? "Processing…" : "Upload a file"}
                  </Button>
                  {photo && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto("")}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste a link to an image, or upload one from your device — an uploaded photo is
              resized to a small thumbnail and stored with your account.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={updatePreferences.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updatePreferences.isPending || processingFile || !name.trim()}
          >
            {updatePreferences.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileActivityList({ logs, loading }: { logs: ActivityLogEntry[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [severity, setSeverity] = useState<ActivitySeverity | "all">("all");
  const [timeFilter, setTimeFilter] = useState<ActivityTimeFilter>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesSearch =
        !term ||
        [log.id, log.action, log.target, log.category, log.severity].some((value) =>
          value.toLowerCase().includes(term),
        );
      const matchesCategory = category === "all" || log.category === category;
      const matchesSeverity = severity === "all" || log.severity === severity;
      return (
        matchesSearch &&
        matchesCategory &&
        matchesSeverity &&
        matchesTimeFilter(log.occurredAt, timeFilter)
      );
    });
  }, [logs, search, category, severity, timeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice(
    (currentPage - 1) * ACTIVITY_PAGE_SIZE,
    currentPage * ACTIVITY_PAGE_SIZE,
  );
  const hasFilters =
    !!search.trim() || category !== "all" || severity !== "all" || timeFilter !== "all";

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setSeverity("all");
    setTimeFilter("all");
    setPage(1);
  }

  if (loading) {
    return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_150px_150px_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search action, target or module…"
            className="pl-8"
          />
        </div>
        <Select
          value={category}
          onValueChange={(value) => {
            setCategory(value as ActivityCategory | "all");
            resetPage();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {ACTIVITY_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(value) => {
            setSeverity(value as ActivitySeverity | "all");
            resetPage();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={timeFilter}
          onValueChange={(value) => {
            setTimeFilter(value as ActivityTimeFilter);
            resetPage();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={clearFilters} disabled={!hasFilters}>
          Clear
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {logs.length === 0
            ? "Nothing recorded yet — actions you take (creating a record, changing a status, etc.) will show up here."
            : "No activity matches your filters."}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((log) => (
            <div
              key={log.id}
              className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{log.action}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {log.target} · {log.timestamp}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                <Badge variant="outline">{CATEGORY_LABELS[log.category]}</Badge>
                <Badge variant={SEVERITY_VARIANT[log.severity]} className="capitalize">
                  {log.severity}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {filtered.length} entries · Page {currentPage} of {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// An Account (Zoho SSO identity) and an Employee (HR directory record) are
// entirely separate tables with no shared id — plenty of admin/super-admin
// accounts exist purely to run the portal and were never hired as an actual
// TGO employee. The best available signal tying "me, signed in" to "me, in
// the directory" is an exact name match against either the account's
// display name or its first+last name, normalized the same way
// import-employees-dialog.tsx already matches cross-imported rows. Good
// enough for "show my own birthday/anniversary/awards if I have a directory
// row" — not used anywhere access-control-relevant.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function ProfilePage() {
  const { data: account, isLoading } = useCurrentAccount();
  const updatePreferences = useUpdateMyPreferences();
  const { data: myActivity, isLoading: activityLoading } = useMyActivityLogs(account?.id, 200);
  const employees = useEmployees();
  const awards = useAwards(canViewAwards(account?.permissions));

  const displayName =
    account?.display_name ||
    [account?.first_name, account?.last_name].filter(Boolean).join(" ") ||
    account?.email ||
    "";

  const accountNameCandidates = [
    account?.display_name,
    [account?.first_name, account?.last_name].filter(Boolean).join(" "),
  ].filter((name): name is string => !!name?.trim());
  const myEmployeeRecord = employees.find((e) =>
    accountNameCandidates.some((candidate) => normalizeName(candidate) === normalizeName(e.name)),
  );
  const myAwards = myEmployeeRecord
    ? awards.filter((a) => a.employeeId === myEmployeeRecord.id)
    : [];
  const myAnniversaryYears = myEmployeeRecord
    ? Math.max(
        0,
        new Date().getFullYear() - parseCalendarDate(myEmployeeRecord.startDate).getFullYear(),
      )
    : null;

  function setTheme(theme: Theme) {
    applyTheme(theme);
    updatePreferences.mutate(
      { theme },
      {
        onSuccess: () => toast.success(`Switched to ${theme} mode`),
        onError: () => {
          toast.error("Couldn't save your theme preference");
          // The DOM already flipped optimistically — put it back if the save failed.
          if (account) applyTheme(account.theme);
        },
      },
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Profile" description="Your account and how HR Operations looks for you." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Seeded from your first Zoho sign-in — it's yours to customize from here on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isLoading && account && (
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <Avatar className="size-16">
                  {account.photo_url && <AvatarImage src={account.photo_url} alt={displayName} />}
                  <AvatarFallback className="text-base">{initials(displayName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <p className="text-base font-semibold">{displayName}</p>
                  <p className="text-sm text-muted-foreground">{account.email}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="secondary" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> {ROLE_LABELS[account.role]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Last signed in {formatDate(account.last_login_at ?? undefined)}
                    </span>
                  </div>
                </div>
                <EditProfileDialog displayName={displayName} photoUrl={account.photo_url ?? ""} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Personal to your account — this follows you to any device you sign in on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground">Switch between light and dark mode.</p>
              </div>
              <div className="flex items-center gap-1 rounded-md border p-1">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                    account?.theme === "light"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                    account?.theme === "dark"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </button>
              </div>
            </div>
            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">
              Looking for notification and default-office preferences? Those live on the{" "}
              <Link
                to="/settings"
                className="font-medium text-primary underline underline-offset-2"
              >
                Settings
              </Link>{" "}
              page.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AwardIcon className="h-4 w-4 text-muted-foreground" />
            My Employee Info
          </CardTitle>
          <CardDescription>
            {myEmployeeRecord
              ? "Matched to your row in the Employee Directory by name."
              : "Not linked to an Employee Directory row — some admin accounts aren't hired employees."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border bg-muted/20 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Cake className="h-3.5 w-3.5 text-muted-foreground" /> Birthday
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {myEmployeeRecord?.birthday ? formatDate(myEmployeeRecord.birthday) : "No data"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <AwardIcon className="h-3.5 w-3.5 text-muted-foreground" /> Work anniversary
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {myEmployeeRecord
                  ? `Joined ${formatDate(myEmployeeRecord.startDate)} · ${formatYears(myAnniversaryYears ?? 0)} with TGO`
                  : "No data"}
              </p>
            </div>
            <div className="rounded-md border bg-muted/20 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Trophy className="h-3.5 w-3.5 text-muted-foreground" /> Awards
              </p>
              {!myEmployeeRecord ? (
                <p className="mt-1 text-sm text-muted-foreground">No data</p>
              ) : myAwards.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No awards yet</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {myAwards.map((a) => (
                    <li key={a.id} className="truncate text-sm text-muted-foreground">
                      {a.title} · {formatDate(a.awardedDate)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            My Permissions
          </CardTitle>
          <CardDescription>
            What your role{account ? ` (${ROLE_LABELS[account.role]})` : ""} lets you do across HR
            Operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (account?.permissions.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              Your role doesn't currently hold any permissions.
            </p>
          )}
          {account?.permissions.map((perm) => {
            const label = PERMISSION_LABELS[perm];
            return (
              <div key={perm} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="font-medium">{label.title}</p>
                  <p className="text-xs text-muted-foreground">{label.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            My Activity
          </CardTitle>
          <CardDescription>
            Filter and page through your recent activity across HR Operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProfileActivityList logs={myActivity ?? []} loading={activityLoading} />
          {(myActivity?.length ?? 0) > 0 && (
            <>
              <Separator className="my-1" />
              <Link
                to="/activity-logs"
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                View the full activity log
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
