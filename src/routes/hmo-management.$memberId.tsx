// Full HMO member profile — SOP section 7's sample layout (header +
// Employee Information / Membership & Coverage / Payment & Billing /
// Enrollment & Card / Offboarding sections) plus an Activity History panel
// (section 8), reachable by clicking a member's name or "View" in
// hmo-management.index.tsx. A real page, not a dialog — same reasoning as
// directory.$employeeId.tsx: linkable/shareable/back-buttonable.
//
// Every field on every card is editable in place and autosaves — a Select/
// date/checkbox change saves immediately, a text/number field debounces
// ~700ms after the last keystroke so a fast typist isn't firing one PATCH
// per character. A single indicator near the header (Saving.../All changes
// saved) and one toast per completed save reflect the same underlying
// mutation regardless of which field triggered it.
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListToolbar, TablePager } from "@/components/list-toolbar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useHmoMemberActivityLogs } from "@/data/activity-log-store";
import {
  HMO_BILLING_STATUSES,
  HMO_ENROLLMENT_STATUSES,
  HMO_INACTIVE_REASONS,
  HMO_INCLUSION_OPTIONS,
  HMO_MANAGER_EVALUATIONS,
  HMO_MBL_OPTIONS,
  HMO_MEMBER_STATUSES,
  HMO_PHYSICAL_CARD_STATUSES,
  HMO_RANK_OPTIONS,
  HMO_REMOVAL_STATUSES,
  HMO_ROOM_AND_BOARD_OPTIONS,
  HMO_VIRTUAL_CARD_STATUSES,
} from "@/data/hmo-api";
import { useHmoMembersQuery, useUpdateHmoMember } from "@/data/hmo-store";
import { canManageBenefits, canViewBenefits } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";
import { uniqueOptions, useListControls } from "@/lib/use-list-controls";

export const Route = createFileRoute("/hmo-management/$memberId")({
  head: () => ({
    meta: [{ title: "HMO Member Profile — Torero Global Outsourcing HR Operations" }],
  }),
  component: HmoMemberProfilePage,
});

// How long after the last keystroke a text/number field autosaves.
const DEBOUNCE_MS = 700;
// How long the "All changes saved" indicator stays up before fading back to
// idle (blank) — long enough to notice, short enough not to feel stuck.
const SAVED_INDICATOR_MS = 2000;

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

function formatCurrency(amount: number | null): string {
  if (amount == null) return "—";
  return `₱${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDate(dateIso: string | null): string {
  if (!dateIso) return "—";
  return new Date(dateIso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const backLink = (
  <Link
    to="/hmo-management"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft className="h-4 w-4" /> Back to HMO Management
  </Link>
);

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" /> All changes saved
      </span>
    );
  }
  return null;
}

function HmoMemberProfilePage() {
  const { memberId } = Route.useParams();
  const { data: account, isLoading: accountLoading } = useCurrentAccount();
  const canView = canViewBenefits(account?.permissions);
  const canManage = canManageBenefits(account?.permissions);

  const { data: membersData, isLoading: membersLoading } = useHmoMembersQuery(canView);
  const members = useMemo(() => membersData ?? [], [membersData]);
  const member = members.find((m) => m.id === memberId);
  const principal = member?.principalMemberId
    ? members.find((m) => m.id === member.principalMemberId)
    : undefined;

  const { data: activityLogs } = useHmoMemberActivityLogs(memberId);
  // Search, filter-by-person and paging for the Activity History panel.
  const activityControls = useListControls(activityLogs ?? [], {
    searchFields: (log) => [log.action, log.actor, log.timestamp],
    filters: [
      {
        key: "actor",
        label: "people",
        options: uniqueOptions((activityLogs ?? []).map((log) => log.actor)),
        get: (log) => log.actor,
      },
    ],
  });

  const updateMutation = useUpdateHmoMember();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Local, editable copies of every field this page lets someone change —
  // reset only when the member itself changes (not on every 15s background
  // refetch), so an in-progress edit is never clobbered mid-keystroke.
  const [hmoCardNumber, setHmoCardNumber] = useState("");
  const [rank, setRank] = useState("");
  const [roomAndBoard, setRoomAndBoard] = useState("");
  const [mbl, setMbl] = useState("");
  const [dental, setDental] = useState("");
  const [ape, setApe] = useState("");
  const [monthlyPremium, setMonthlyPremium] = useState("");
  const [biweeklyDeduction, setBiweeklyDeduction] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [eligibilityDate, setEligibilityDate] = useState("");
  const [dateEndorsedToEtiqa, setDateEndorsedToEtiqa] = useState("");
  const [hmoEffectivityDate, setHmoEffectivityDate] = useState("");
  const [lastBillingMonth, setLastBillingMonth] = useState("");
  const [inactiveDate, setInactiveDate] = useState("");
  const [removalEndorsedDate, setRemovalEndorsedDate] = useState("");
  const [billingRemarks, setBillingRemarks] = useState("");
  const [enrollmentRemarks, setEnrollmentRemarks] = useState("");
  const [removalRemarks, setRemovalRemarks] = useState("");

  useEffect(() => {
    if (!member) return;
    setHmoCardNumber(member.hmoCardNumber ?? "");
    setRank(member.rank ?? "");
    setRoomAndBoard(member.roomAndBoard ?? "");
    setMbl(member.mbl ?? "");
    setDental(member.dental ?? "");
    setApe(member.ape ?? "");
    setMonthlyPremium(member.monthlyPremium != null ? String(member.monthlyPremium) : "");
    setBiweeklyDeduction(member.biweeklyDeduction != null ? String(member.biweeklyDeduction) : "");
    setHireDate(member.hireDate ?? "");
    setEligibilityDate(member.eligibilityDate ?? "");
    setDateEndorsedToEtiqa(member.dateEndorsedToEtiqa ?? "");
    setHmoEffectivityDate(member.hmoEffectivityDate ?? "");
    setLastBillingMonth(member.lastBillingMonth ?? "");
    setInactiveDate(member.inactiveDate ?? "");
    setRemovalEndorsedDate(member.removalEndorsedDate ?? "");
    setBillingRemarks(member.billingRemarks ?? "");
    setEnrollmentRemarks(member.enrollmentRemarks ?? "");
    setRemovalRemarks(member.removalRemarks ?? "");
    // Only re-seed when a different member loads, not on every background
    // refetch of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  /** Immediate save — used directly by Select/date/checkbox fields (one
   * discrete change = one save), and by patchDebounced below once its timer
   * fires. */
  function patch(fields: Record<string, unknown>) {
    if (!member) return;
    setSaveState("saving");
    updateMutation.mutate(
      { id: member.id, patch: fields },
      {
        onSuccess: () => {
          setSaveState("saved");
          toast.success("Saved");
          if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
          savedTimeoutRef.current = setTimeout(() => setSaveState("idle"), SAVED_INDICATOR_MS);
        },
        onError: (error) => {
          setSaveState("idle");
          console.error(error);
          toast.error(error instanceof Error ? error.message : "Couldn't save that change.");
        },
      },
    );
  }

  /** Debounced save for free-typed fields (text/number/textarea) — waits for
   * a pause in typing before actually saving, keyed per-field so editing two
   * fields in quick succession doesn't cancel each other's timers. */
  function patchDebounced(key: string, fields: Record<string, unknown>) {
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => patch(fields), DEBOUNCE_MS);
  }

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  if (accountLoading || membersLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="HMO Member Profile" description="Loading…" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="HMO Member Profile" description="Employee Benefits." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No access</p>
              <p className="text-sm text-muted-foreground">
                Your account ({account ? ROLE_LABELS[account.role] : "signed out"}) doesn't have
                access to Employee Benefits.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!member) {
    throw notFound();
  }

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={member.displayName}
        description={
          member.memberType === "Principal"
            ? `${member.department ?? "—"} · Principal Member`
            : `${principal?.displayName ?? "—"}'s dependent (${member.relationshipToPrincipal ?? "—"})`
        }
        action={canManage ? <SaveIndicator state={saveState} /> : undefined}
      />

      <Card>
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-lg">{initials(member.displayName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{member.displayName}</p>
              <p className="text-sm text-muted-foreground">
                {member.memberType === "Principal" ? member.employeeId : "Dependent"} ·{" "}
                {member.department ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>HMO Status: {member.memberStatus}</Badge>
            <Badge variant="secondary">Enrollment Status: {member.enrollmentStatus}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {member.memberType === "Principal" && (
          <Card>
            <CardHeader>
              <CardTitle>Employee Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Employee ID</p>
                <p className="font-medium">{member.employeeId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="font-medium">{member.department ?? "—"}</p>
              </div>
              <div>
                <Label htmlFor="hire-date" className="text-xs text-muted-foreground">
                  Hire Date
                </Label>
                {canManage ? (
                  <Input
                    id="hire-date"
                    type="date"
                    className="mt-1 h-8"
                    value={hireDate}
                    onChange={(e) => {
                      setHireDate(e.target.value);
                      patch({ hireDate: e.target.value || null });
                    }}
                  />
                ) : (
                  <p className="font-medium">{formatDate(member.hireDate)}</p>
                )}
              </div>
              <div>
                <Label htmlFor="eligibility-date" className="text-xs text-muted-foreground">
                  HMO Eligibility Date
                </Label>
                {canManage ? (
                  <Input
                    id="eligibility-date"
                    type="date"
                    className="mt-1 h-8"
                    value={eligibilityDate}
                    onChange={(e) => {
                      setEligibilityDate(e.target.value);
                      patch({ eligibilityDate: e.target.value || null });
                    }}
                  />
                ) : (
                  <p className="font-medium">{formatDate(member.eligibilityDate)}</p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Manager Evaluation</p>
                {canManage ? (
                  <Select
                    value={member.managerEvaluation || ""}
                    onValueChange={(v) => patch({ managerEvaluation: v })}
                  >
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      {HMO_MANAGER_EVALUATIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium">{member.managerEvaluation ?? "—"}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {member.memberType === "Dependent" && (
          <Card>
            <CardHeader>
              <CardTitle>Dependent Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Principal Member</p>
                <p className="font-medium">{principal?.displayName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship</p>
                <p className="font-medium">{member.relationshipToPrincipal ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Birthday</p>
                <p className="font-medium">{formatDate(member.birthday)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Membership & Coverage</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label htmlFor="hmo-card-number" className="text-xs text-muted-foreground">
                HMO Card Number
              </Label>
              {canManage ? (
                <Input
                  id="hmo-card-number"
                  className="mt-1 h-8"
                  value={hmoCardNumber}
                  onChange={(e) => {
                    setHmoCardNumber(e.target.value);
                    patchDebounced("hmoCardNumber", { hmoCardNumber: e.target.value || null });
                  }}
                />
              ) : (
                <p className="font-medium">{member.hmoCardNumber ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Member Status</p>
              {canManage ? (
                <Select
                  value={member.memberStatus}
                  onValueChange={(v) => patch({ memberStatus: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_MEMBER_STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.memberStatus}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rank</p>
              {canManage ? (
                <Select
                  value={rank || ""}
                  onValueChange={(v) => {
                    setRank(v);
                    patch({ rank: v });
                  }}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_RANK_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.rank ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Room & Board</p>
              {canManage ? (
                <Select
                  value={roomAndBoard || ""}
                  onValueChange={(v) => {
                    setRoomAndBoard(v);
                    patch({ roomAndBoard: v });
                  }}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_ROOM_AND_BOARD_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.roomAndBoard ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">MBL</p>
              {canManage ? (
                <Select
                  value={mbl || ""}
                  onValueChange={(v) => {
                    setMbl(v);
                    patch({ mbl: v });
                  }}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_MBL_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.mbl ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dental</p>
              {canManage ? (
                <Select
                  value={dental || ""}
                  onValueChange={(v) => {
                    setDental(v);
                    patch({ dental: v });
                  }}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_INCLUSION_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.dental ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">APE</p>
              {canManage ? (
                <Select
                  value={ape || ""}
                  onValueChange={(v) => {
                    setApe(v);
                    patch({ ape: v });
                  }}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_INCLUSION_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.ape ?? "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment & Billing</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label htmlFor="monthly-premium" className="text-xs text-muted-foreground">
                Monthly Premium
              </Label>
              {canManage ? (
                <Input
                  id="monthly-premium"
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 h-8"
                  value={monthlyPremium}
                  onChange={(e) => {
                    setMonthlyPremium(e.target.value);
                    patchDebounced("monthlyPremium", {
                      monthlyPremium: e.target.value ? Number(e.target.value) : null,
                    });
                  }}
                />
              ) : (
                <p className="font-medium">{formatCurrency(member.monthlyPremium)}</p>
              )}
            </div>
            <div>
              <Label htmlFor="biweekly-deduction" className="text-xs text-muted-foreground">
                Bi-Weekly Deduction
              </Label>
              {canManage ? (
                <Input
                  id="biweekly-deduction"
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 h-8"
                  value={biweeklyDeduction}
                  onChange={(e) => {
                    setBiweeklyDeduction(e.target.value);
                    patchDebounced("biweeklyDeduction", {
                      biweeklyDeduction: e.target.value ? Number(e.target.value) : null,
                    });
                  }}
                />
              ) : (
                <p className="font-medium">{formatCurrency(member.biweeklyDeduction)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Billing Status</p>
              {canManage ? (
                <Select
                  value={member.billingStatus}
                  onValueChange={(v) => patch({ billingStatus: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_BILLING_STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.billingStatus}</p>
              )}
            </div>
            <div>
              <Label htmlFor="last-billing-month" className="text-xs text-muted-foreground">
                Last Billing Month
              </Label>
              {canManage ? (
                <Input
                  id="last-billing-month"
                  type="date"
                  className="mt-1 h-8"
                  value={lastBillingMonth}
                  onChange={(e) => {
                    setLastBillingMonth(e.target.value);
                    patch({ lastBillingMonth: e.target.value || null });
                  }}
                />
              ) : (
                <p className="font-medium">{formatDate(member.lastBillingMonth)}</p>
              )}
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="billing-remarks" className="text-xs text-muted-foreground">
                Billing Remarks
              </Label>
              {canManage ? (
                <Textarea
                  id="billing-remarks"
                  value={billingRemarks}
                  onChange={(e) => {
                    setBillingRemarks(e.target.value);
                    patchDebounced("billingRemarks", { billingRemarks: e.target.value || null });
                  }}
                  rows={2}
                />
              ) : (
                <p className="text-sm">{member.billingRemarks || "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enrollment & Card</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Enrollment Status</p>
              {canManage ? (
                <Select
                  value={member.enrollmentStatus}
                  onValueChange={(v) => patch({ enrollmentStatus: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_ENROLLMENT_STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.enrollmentStatus}</p>
              )}
            </div>
            <div>
              <Label htmlFor="date-endorsed" className="text-xs text-muted-foreground">
                Date Endorsed to ETIQA
              </Label>
              {canManage ? (
                <Input
                  id="date-endorsed"
                  type="date"
                  className="mt-1 h-8"
                  value={dateEndorsedToEtiqa}
                  onChange={(e) => {
                    setDateEndorsedToEtiqa(e.target.value);
                    patch({ dateEndorsedToEtiqa: e.target.value || null });
                  }}
                />
              ) : (
                <p className="font-medium">{formatDate(member.dateEndorsedToEtiqa)}</p>
              )}
            </div>
            <div>
              <Label htmlFor="hmo-effectivity-date" className="text-xs text-muted-foreground">
                HMO Effectivity Date
              </Label>
              {canManage ? (
                <Input
                  id="hmo-effectivity-date"
                  type="date"
                  className="mt-1 h-8"
                  value={hmoEffectivityDate}
                  onChange={(e) => {
                    setHmoEffectivityDate(e.target.value);
                    patch({ hmoEffectivityDate: e.target.value || null });
                  }}
                />
              ) : (
                <p className="font-medium">{formatDate(member.hmoEffectivityDate)}</p>
              )}
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id="requirements-complete"
                checked={member.requirementsComplete}
                disabled={!canManage}
                onCheckedChange={(checked) => patch({ requirementsComplete: checked === true })}
              />
              <Label htmlFor="requirements-complete" className="text-sm font-normal">
                Requirements Complete
              </Label>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Virtual Card</p>
              {canManage ? (
                <Select
                  value={member.virtualCardStatus}
                  onValueChange={(v) => patch({ virtualCardStatus: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_VIRTUAL_CARD_STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.virtualCardStatus}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Physical Card</p>
              {canManage ? (
                <Select
                  value={member.physicalCardStatus}
                  onValueChange={(v) => patch({ physicalCardStatus: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_PHYSICAL_CARD_STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.physicalCardStatus}</p>
              )}
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="enrollment-remarks" className="text-xs text-muted-foreground">
                Enrollment Remarks
              </Label>
              {canManage ? (
                <Textarea
                  id="enrollment-remarks"
                  value={enrollmentRemarks}
                  onChange={(e) => {
                    setEnrollmentRemarks(e.target.value);
                    patchDebounced("enrollmentRemarks", {
                      enrollmentRemarks: e.target.value || null,
                    });
                  }}
                  rows={2}
                />
              ) : (
                <p className="text-sm">{member.enrollmentRemarks || "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Offboarding / Removal</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id="removal-required"
                checked={member.removalRequired}
                disabled={!canManage}
                onCheckedChange={(checked) => patch({ removalRequired: checked === true })}
              />
              <Label htmlFor="removal-required" className="text-sm font-normal">
                Removal Required
              </Label>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Removal Status</p>
              {canManage ? (
                <Select
                  value={member.removalStatus}
                  onValueChange={(v) => patch({ removalStatus: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_REMOVAL_STATUSES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.removalStatus}</p>
              )}
            </div>
            <div>
              <Label htmlFor="inactive-date" className="text-xs text-muted-foreground">
                Inactive Date
              </Label>
              {canManage ? (
                <Input
                  id="inactive-date"
                  type="date"
                  className="mt-1 h-8"
                  value={inactiveDate}
                  onChange={(e) => {
                    setInactiveDate(e.target.value);
                    patch({ inactiveDate: e.target.value || null });
                  }}
                />
              ) : (
                <p className="font-medium">{formatDate(member.inactiveDate)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inactive Reason</p>
              {canManage ? (
                <Select
                  value={member.inactiveReason || ""}
                  onValueChange={(v) => patch({ inactiveReason: v })}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {HMO_INACTIVE_REASONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">{member.inactiveReason ?? "—"}</p>
              )}
            </div>
            <div>
              <Label htmlFor="removal-endorsed-date" className="text-xs text-muted-foreground">
                Removal Endorsed Date
              </Label>
              {canManage ? (
                <Input
                  id="removal-endorsed-date"
                  type="date"
                  className="mt-1 h-8"
                  value={removalEndorsedDate}
                  onChange={(e) => {
                    setRemovalEndorsedDate(e.target.value);
                    patch({ removalEndorsedDate: e.target.value || null });
                  }}
                />
              ) : (
                <p className="font-medium">{formatDate(member.removalEndorsedDate)}</p>
              )}
            </div>
            <div className="col-span-2 grid gap-1.5 sm:col-span-4">
              <Label htmlFor="removal-remarks" className="text-xs text-muted-foreground">
                Removal Remarks
              </Label>
              {canManage ? (
                <Textarea
                  id="removal-remarks"
                  value={removalRemarks}
                  onChange={(e) => {
                    setRemovalRemarks(e.target.value);
                    patchDebounced("removalRemarks", { removalRemarks: e.target.value || null });
                  }}
                  rows={2}
                />
              ) : (
                <p className="text-sm">{member.removalRemarks || "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
        </CardHeader>
        <CardContent>
          {!activityLogs || activityLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <>
              <ListToolbar
                controls={activityControls}
                searchPlaceholder="Search activity..."
                noun="entries"
              />
              {activityControls.pageItems.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No activity matches your search or filters.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {activityControls.pageItems.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-4 border-b pb-2 text-sm last:border-0"
                    >
                      <div>
                        <p>{log.action}</p>
                        <p className="text-xs text-muted-foreground">{log.actor}</p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {log.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="-mx-6 -mb-6 mt-4">
                <TablePager controls={activityControls} noun="entries" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
