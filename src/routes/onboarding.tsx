import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Pencil,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { ShieldAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableStateRow } from "@/components/table-state-row";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterSelect } from "@/components/filter-select";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/metric-card";
import {
  OnboardingExportButton,
  OnboardingImportDialog,
} from "@/components/onboarding-import-export";
import { OnboardingHireDialog } from "@/components/onboarding-hire-dialog";
import { OnboardingNotifyDialog } from "@/components/onboarding-notify-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computeStatus,
  formatOnboardingStartDate,
  type NewHire,
  type NewHirePatch,
} from "@/data/new-hire-api";
import { useDeleteNewHire, useNewHiresQuery, useUpdateNewHire } from "@/data/new-hire-store";
import { canEditOnboardingField, canManageOnboarding, canViewOnboarding } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Onboarding Tracker — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Track new hires through the 7-step onboarding checklist, from job offer discussion to onboarding day.",
      },
      {
        property: "og:title",
        content: "Onboarding Tracker — Torero Global Outsourcing HR Operations",
      },
      {
        property: "og:description",
        content: "The onboarding checklist tracker for recruitment and HR.",
      },
    ],
  }),
  component: OnboardingPage,
});

type ChecklistKey =
  | "joDiscussion"
  | "confirmationSigned"
  | "welcomeEmailSent"
  | "newHireInfo"
  | "idPhoto"
  | "credentialsCreated"
  | "onboardingDay";

// Field labels match the SOP's section 4.1 column reference table (items
// 1-7); Completed By is rendered after all seven checkboxes rather than at
// its SOP column position (between items 3 and 4) — a deliberate UI
// deviation from the SOP's literal column order, requested directly.
const CHECKLIST_COLUMNS: { key: ChecklistKey; label: string }[] = [
  { key: "joDiscussion", label: "1. JO Discussion" },
  { key: "confirmationSigned", label: "2. Confirmation Sheet Signed" },
  { key: "welcomeEmailSent", label: "3. Welcome Email Sent" },
  { key: "newHireInfo", label: "4. New Hire Info Completed" },
  { key: "idPhoto", label: "5. ID Photo Provided" },
  { key: "credentialsCreated", label: "6. Credentials Created" },
  { key: "onboardingDay", label: "7. Onboarding Day" },
];

const PAGE_SIZE = 8;

function StatusBadge({ status }: { status: ReturnType<typeof computeStatus> }) {
  if (status === "Complete") return <Badge>Complete</Badge>;
  if (status === "In Progress") return <Badge variant="secondary">In Progress</Badge>;
  return <Badge variant="outline">Not Started</Badge>;
}

function OnboardingPage() {
  const { data: account, isLoading: accountLoading } = useCurrentAccount();
  const canView = canViewOnboarding(account?.permissions);
  const {
    data: hiresData,
    isLoading: hiresLoading,
    isError: hiresError,
    refetch,
  } = useNewHiresQuery(canView);
  const hires = useMemo(() => hiresData ?? [], [hiresData]);
  const canManage = canManageOnboarding(account?.permissions);
  const updateMutation = useUpdateNewHire();
  const deleteMutation = useDeleteNewHire();

  const [query, setQuery] = useState("");
  const [leadFilter, setLeadFilter] = useState("all");
  const [specialistFilter, setSpecialistFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<NewHire | null>(null);
  const [notified, setNotified] = useState<Record<string, boolean>>({});

  function handleNotified(hire: NewHire) {
    toast.success(`Notification sent for ${hire.name}`);
    setNotified((prev) => ({ ...prev, [hire.id]: true }));
    setTimeout(() => setNotified((prev) => ({ ...prev, [hire.id]: false })), 1800);
  }

  const leadOptions = useMemo(
    () => Array.from(new Set(hires.map((h) => h.recruitmentLead).filter(Boolean))).sort(),
    [hires],
  );
  const specialistOptions = useMemo(
    () => Array.from(new Set(hires.map((h) => h.onboardingSpecialist).filter(Boolean))).sort(),
    [hires],
  );
  const statusOptions = ["Not Started", "In Progress", "Complete"];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hires.filter((h) => {
      const matchesQuery = !q || `${h.name} ${h.roleTitle}`.toLowerCase().includes(q);
      const matchesLead = leadFilter === "all" || h.recruitmentLead === leadFilter;
      const matchesSpecialist =
        specialistFilter === "all" || h.onboardingSpecialist === specialistFilter;
      const matchesStatus = statusFilter === "all" || computeStatus(h) === statusFilter;
      return matchesQuery && matchesLead && matchesSpecialist && matchesStatus;
    });
  }, [hires, query, leadFilter, specialistFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = hires.length;
    const complete = hires.filter((h) => computeStatus(h) === "Complete").length;
    const inProgress = hires.filter((h) => computeStatus(h) === "In Progress").length;
    const notStarted = total - complete - inProgress;
    return { total, complete, inProgress, notStarted };
  }, [hires]);

  function handleAdded() {
    setQuery("");
    setLeadFilter("all");
    setSpecialistFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  // Checking a later step implies every earlier step already happened, so
  // ticking it also ticks anything before it — but only the earlier steps
  // the acting role is actually allowed to write (see canEditOnboardingField).
  // A Recruitment Lead checking step 3 also fills in steps 1-2 (all three are
  // theirs); an Onboarding Specialist checking step 4 only fills in step 3
  // (the shared step) and leaves 1-2 alone, since those are Recruitment
  // Lead's exclusive fields and this account can't attest to them. Admin
  // always fills in everything earlier, since every field is theirs.
  // Unchecking only clears the one box; it doesn't cascade backwards.
  async function handleToggle(hire: NewHire, field: ChecklistKey) {
    const turningOn = !hire[field];
    const patch: NewHirePatch = { [field]: turningOn };

    if (turningOn) {
      const clickedIndex = CHECKLIST_COLUMNS.findIndex((c) => c.key === field);
      for (const col of CHECKLIST_COLUMNS.slice(0, clickedIndex)) {
        if (!hire[col.key] && canEditOnboardingField(account?.role, col.key)) {
          patch[col.key] = true;
        }
      }
    }

    try {
      await updateMutation.mutateAsync({ id: hire.id, patch });
    } catch (error) {
      console.error(error);
      toast.error("Couldn't save that change. Please try again.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`${deleteTarget.name} removed from the tracker`);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't remove ${deleteTarget.name}. Please try again.`);
    }
  }

  if (accountLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Onboarding Tracker"
          description="Track new hires through the 7-step onboarding checklist."
        />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Onboarding Tracker"
          description="Track new hires through the 7-step onboarding checklist."
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No access</p>
              <p className="text-sm text-muted-foreground">
                Your account ({account ? ROLE_LABELS[account.role] : "signed out"}) doesn't have
                access to the Onboarding Tracker. Ask a Super Admin to grant it from the permission
                matrix on User Management if you need it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding Tracker"
        description="Track new hires through the 7-step onboarding checklist."
        action={canManage ? <OnboardingHireDialog onCreated={handleAdded} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          loading={hiresLoading}
          unavailable={hiresError}
          title="Total"
          value={stats.total}
          hint="New hires tracked"
          icon={Users}
        />
        <MetricCard
          loading={hiresLoading}
          unavailable={hiresError}
          title="Not Started"
          value={stats.notStarted}
          hint="No checklist steps yet"
          icon={Circle}
        />
        <MetricCard
          loading={hiresLoading}
          unavailable={hiresError}
          title="In Progress"
          value={stats.inProgress}
          hint="Some steps completed"
          icon={TrendingUp}
        />
        <MetricCard
          loading={hiresLoading}
          unavailable={hiresError}
          title="Complete"
          value={stats.complete}
          hint="Every step checked"
          icon={CheckCircle2}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or role..."
            className="pl-9"
          />
        </div>
        <FilterSelect
          value={leadFilter}
          onChange={(v) => {
            setLeadFilter(v);
            setPage(1);
          }}
          placeholder="Recruitment lead"
          allLabel="All recruitment leads"
          options={leadOptions}
        />
        <FilterSelect
          value={specialistFilter}
          onChange={(v) => {
            setSpecialistFilter(v);
            setPage(1);
          }}
          placeholder="Onboarding specialist"
          allLabel="All onboarding specialists"
          options={specialistOptions}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          placeholder="Status"
          allLabel="All statuses"
          options={statusOptions}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <OnboardingExportButton hires={filtered} />
        {canManage && <OnboardingImportDialog />}
        {canManage && hires.length > 0 && (
          <OnboardingNotifyDialog
            hires={hires}
            onSent={handleNotified}
            trigger={
              <Button size="sm" variant="outline" className="h-8">
                <Bell className="h-3.5 w-3.5" />
                Notify
              </Button>
            }
          />
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-[160px] bg-muted">Name</TableHead>
                <TableHead className="min-w-[140px]">Role</TableHead>
                <TableHead className="min-w-[160px]">Start Date</TableHead>
                <TableHead className="min-w-[140px]">Recruitment Lead</TableHead>
                <TableHead className="min-w-[150px]">Onboarding Specialist</TableHead>
                {CHECKLIST_COLUMNS.map((col) => (
                  <TableHead key={col.key} className="text-center">
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="min-w-[150px]">Completed By</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {hiresLoading && (
                <TableStateRow
                  colSpan={CHECKLIST_COLUMNS.length + (canManage ? 9 : 8)}
                  kind="loading"
                  title="Loading onboarding…"
                />
              )}
              {hiresError && (
                <TableStateRow
                  colSpan={CHECKLIST_COLUMNS.length + (canManage ? 9 : 8)}
                  kind="error"
                  title="Unable to load onboarding"
                  onRetry={() => void refetch()}
                />
              )}
              {!hiresLoading && !hiresError && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={CHECKLIST_COLUMNS.length + (canManage ? 9 : 8)}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {hires.length === 0
                      ? "No new hires here yet. Add one, or import an Excel file."
                      : "Nothing matches these filters."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((hire) => {
                const status = computeStatus(hire);
                return (
                  <TableRow key={hire.id}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">
                      {hire.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{hire.roleTitle}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatOnboardingStartDate(hire.startDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {hire.recruitmentLead || (
                        <span className="italic text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {hire.onboardingSpecialist || (
                        <span className="italic text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    {CHECKLIST_COLUMNS.map((col) => (
                      <TableCell key={col.key} className="text-center">
                        <Checkbox
                          checked={hire[col.key]}
                          disabled={
                            !canEditOnboardingField(account?.role, col.key) ||
                            updateMutation.isPending
                          }
                          onCheckedChange={() => handleToggle(hire, col.key)}
                          className="mx-auto"
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-muted-foreground">
                      {hire.completedBy ?? (
                        <span className="italic text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <OnboardingNotifyDialog
                            hires={hires}
                            initialHire={hire}
                            onSent={handleNotified}
                            trigger={
                              <Button
                                size="icon"
                                variant={notified[hire.id] ? "secondary" : "ghost"}
                                title="Notify"
                                className="h-7 w-7"
                              >
                                <Bell className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                          <OnboardingHireDialog
                            hire={hire}
                            trigger={
                              <Button size="icon" variant="ghost" title="Edit" className="h-7 w-7">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(hire)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} of {filtered.length} new hires
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
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {pageCount}
          </span>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove this new hire?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteTarget?.name || "this row"} from the onboarding
              tracker. This can't be undone, though the deletion itself is logged in the activity
              log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Removing..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
