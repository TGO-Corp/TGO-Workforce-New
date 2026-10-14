// HMO Management — Overview/Enrollment Queue/Dependents/HMO Members/Card
// Tracking/Requests/Billing, per the SOP handed off by the Projects Team
// (TGO_HMO_Management_Portal_Update_Requirements.docx). Real, database-backed
// data (backend/app/api/routes/hmo.py) — replaces the earlier frontend-only
// prototype. Design rule carried everywhere here, per the SOP: Enrollment
// Status (where in the workflow) and Member Status (whether usable right
// now) are two independent fields, never conflated.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  HeartPulse,
  IdCard,
  Loader2,
  Plus,
  Receipt,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

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
import { PageHeader } from "@/components/app-shell";
import { HmoMemberFormDialog } from "@/components/hmo-member-form-dialog";
import { ListToolbar, TablePager } from "@/components/list-toolbar";
import { MetricCard } from "@/components/metric-card";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  HMO_ENROLLMENT_STATUSES,
  HMO_MEMBER_TYPES,
  HMO_PHYSICAL_CARD_STATUSES,
  HMO_VIRTUAL_CARD_STATUSES,
  type HmoEnrollmentStatus,
  type HmoMember,
  type HmoPhysicalCardStatus,
  type HmoRequestStatus,
  type HmoVirtualCardStatus,
} from "@/data/hmo-api";
import {
  useCreateHmoBillingPeriod,
  useCreateHmoRequest,
  useDeleteHmoMember,
  useHmoBillingPeriodsQuery,
  useHmoMembersQuery,
  useHmoRequestsQuery,
  useUpdateHmoMember,
  useUpdateHmoRequest,
} from "@/data/hmo-store";
import { exportHmoMembersCsv, exportHmoMembersPdf } from "@/lib/hmo-export";
import { canManageBenefits, canViewBenefits } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import { useCurrentAccount } from "@/lib/session";
import { uniqueOptions, useListControls } from "@/lib/use-list-controls";

export const Route = createFileRoute("/hmo-management/")({
  head: () => ({
    meta: [
      { title: "HMO Management — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Eligibility, enrollment, dependents, cards, billing and removal for HMO members.",
      },
    ],
  }),
  component: HmoManagementPage,
});

const ALL = "all";

const ENROLLMENT_STATUS_VARIANT: Record<
  HmoEnrollmentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  "Not Eligible": "secondary",
  "For Manager Evaluation": "outline",
  "Waiting for Requirements": "outline",
  "Ready for Endorsement": "outline",
  "Endorsed to ETIQA": "outline",
  "For Processing": "outline",
  Activated: "default",
  "On Hold": "secondary",
  Rejected: "destructive",
  Cancelled: "destructive",
};

const MEMBER_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "Not Yet Active": "outline",
  Active: "default",
  Inactive: "secondary",
  Suspended: "secondary",
  Terminated: "destructive",
};

const REQUEST_STATUS_VARIANT: Record<HmoRequestStatus, "default" | "secondary" | "destructive"> = {
  Pending: "secondary",
  Approved: "default",
  Rejected: "destructive",
};

const PENDING_ENROLLMENT_STATUSES: HmoEnrollmentStatus[] = [
  "For Manager Evaluation",
  "Waiting for Requirements",
  "Ready for Endorsement",
  "Endorsed to ETIQA",
  "For Processing",
];

function daysUntil(dateIso: string): number {
  return Math.round((new Date(dateIso).getTime() - Date.now()) / 86_400_000);
}

function formatCurrency(amount: number): string {
  return `₱${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Animated placeholder rows shown while a table's data is still loading —
 * one skeleton bar per row, spanning every column, so the table doesn't
 * flash between "Loading…" text and real rows. */
function TableSkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={columns} className="py-3">
            <Skeleton className="h-5 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function formatDate(dateIso: string | null): string {
  if (!dateIso) return "—";
  return new Date(dateIso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function HmoManagementPage() {
  const { data: account, isLoading: accountLoading } = useCurrentAccount();
  const canView = canViewBenefits(account?.permissions);
  const canManage = canManageBenefits(account?.permissions);

  const {
    data: membersData,
    isLoading: membersLoading,
    isError: membersError,
  } = useHmoMembersQuery(canView);
  const members = useMemo(() => membersData ?? [], [membersData]);
  const { data: requestsData } = useHmoRequestsQuery(canView);
  const requests = useMemo(() => requestsData ?? [], [requestsData]);
  const {
    data: billingPeriodsData,
    isLoading: billingLoading,
    isError: billingError,
  } = useHmoBillingPeriodsQuery(canView);
  const billingPeriods = useMemo(() => billingPeriodsData ?? [], [billingPeriodsData]);

  const updateMemberMutation = useUpdateHmoMember();
  const updateRequestMutation = useUpdateHmoRequest();
  const deleteMemberMutation = useDeleteHmoMember();

  const principals = useMemo(() => members.filter((m) => m.memberType === "Principal"), [members]);
  const dependents = useMemo(() => members.filter((m) => m.memberType === "Dependent"), [members]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [newBillingOpen, setNewBillingOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HmoMember | null>(null);
  const deleteTargetDependentCount = deleteTarget
    ? dependents.filter((d) => d.principalMemberId === deleteTarget.id).length
    : 0;

  async function confirmDeleteMember() {
    if (!deleteTarget) return;
    try {
      await deleteMemberMutation.mutateAsync(deleteTarget.id);
      toast.success(`${deleteTarget.displayName} removed from HMO Management`);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : `Couldn't remove ${deleteTarget.displayName}.`,
      );
    }
  }

  const enrollmentQueue = useMemo(
    () => members.filter((m) => PENDING_ENROLLMENT_STATUSES.includes(m.enrollmentStatus)),
    [members],
  );

  // --- Search, filters and pagination: one set of controls per tab ------------
  // (see @/lib/use-list-controls). Every tab searches its own columns, offers
  // dropdown filters for its status-like fields, and pages 10/25/50 rows at a time.
  const memberStatusOptions = Object.keys(MEMBER_STATUS_VARIANT);
  const principalNameOf = (d: HmoMember) =>
    d.principalMemberId ? (memberById.get(d.principalMemberId)?.displayName ?? null) : null;
  const monthLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  // Newest month first, so page 1 is always the latest billing period.
  const billingRows = useMemo(() => [...billingPeriods].reverse(), [billingPeriods]);

  const membersControls = useListControls(members, {
    searchFields: (m) => [m.displayName, m.department, m.hmoCardNumber, m.rank],
    filters: [
      { key: "type", label: "types", options: HMO_MEMBER_TYPES, get: (m) => m.memberType },
      {
        key: "enrollment",
        label: "enrollment statuses",
        options: HMO_ENROLLMENT_STATUSES,
        get: (m) => m.enrollmentStatus,
      },
      {
        key: "status",
        label: "member statuses",
        options: memberStatusOptions,
        get: (m) => m.memberStatus,
      },
      {
        key: "department",
        label: "departments",
        options: uniqueOptions(members.map((m) => m.department)),
        get: (m) => m.department,
      },
      {
        key: "card",
        label: "card statuses",
        options: HMO_PHYSICAL_CARD_STATUSES,
        get: (m) => m.physicalCardStatus,
      },
    ],
  });
  // What the Export button writes: every row matching the search/filters, not just this page.
  const filteredMembers = membersControls.filtered;

  const queueControls = useListControls(enrollmentQueue, {
    searchFields: (m) => [m.displayName, m.department],
    filters: [
      {
        key: "enrollment",
        label: "enrollment statuses",
        options: PENDING_ENROLLMENT_STATUSES,
        get: (m) => m.enrollmentStatus,
      },
      {
        key: "evaluation",
        label: "manager evaluations",
        options: uniqueOptions(enrollmentQueue.map((m) => m.managerEvaluation)),
        get: (m) => m.managerEvaluation,
      },
      {
        key: "department",
        label: "departments",
        options: uniqueOptions(enrollmentQueue.map((m) => m.department)),
        get: (m) => m.department,
      },
    ],
  });

  const dependentsControls = useListControls(dependents, {
    searchFields: (d) => [d.displayName, d.relationshipToPrincipal, principalNameOf(d)],
    filters: [
      {
        key: "relationship",
        label: "relationships",
        options: uniqueOptions(dependents.map((d) => d.relationshipToPrincipal)),
        get: (d) => d.relationshipToPrincipal,
      },
      {
        key: "status",
        label: "member statuses",
        options: memberStatusOptions,
        get: (d) => d.memberStatus,
      },
      {
        key: "principal",
        label: "principal members",
        options: uniqueOptions(dependents.map(principalNameOf)),
        get: principalNameOf,
      },
    ],
  });

  const cardsControls = useListControls(members, {
    searchFields: (m) => [m.displayName, m.hmoCardNumber],
    filters: [
      {
        key: "virtual",
        label: "virtual cards",
        options: HMO_VIRTUAL_CARD_STATUSES,
        get: (m) => m.virtualCardStatus,
      },
      {
        key: "physical",
        label: "physical cards",
        options: HMO_PHYSICAL_CARD_STATUSES,
        get: (m) => m.physicalCardStatus,
      },
      {
        key: "status",
        label: "member statuses",
        options: memberStatusOptions,
        get: (m) => m.memberStatus,
      },
    ],
  });

  const requestsControls = useListControls(requests, {
    searchFields: (r) => [memberById.get(r.memberId)?.displayName, r.requestType, r.notes],
    filters: [
      {
        key: "status",
        label: "statuses",
        options: ["Pending", "Approved", "Rejected"],
        get: (r) => r.status,
      },
      {
        key: "type",
        label: "request types",
        options: uniqueOptions(requests.map((r) => r.requestType)),
        get: (r) => r.requestType,
      },
    ],
  });

  const billingControls = useListControls(billingRows, {
    searchFields: (b) => [monthLabel(b.month), b.notes],
    filters: [
      {
        key: "year",
        label: "years",
        options: uniqueOptions(
          billingRows.map((b) => String(new Date(b.month).getFullYear())),
        ).reverse(),
        get: (b) => String(new Date(b.month).getFullYear()),
      },
    ],
  });

  // --- SOP dashboard KPIs (section 3) --------------------------------------
  const activeMembers = members.filter((m) => m.memberStatus === "Active").length;
  const becomingEligible = members.filter(
    (m) =>
      m.enrollmentStatus === "Not Eligible" &&
      m.eligibilityDate &&
      daysUntil(m.eligibilityDate) <= 30 &&
      daysUntil(m.eligibilityDate) >= 0,
  ).length;
  const pendingManagerEvaluation = members.filter((m) => m.managerEvaluation === "Pending").length;
  const pendingEnrollmentCount = enrollmentQueue.length;
  const pendingRequirements = members.filter(
    (m) =>
      !m.requirementsComplete &&
      m.enrollmentStatus !== "Not Eligible" &&
      m.enrollmentStatus !== "Activated",
  ).length;
  const physicalCardsPending = members.filter(
    (m) => m.memberStatus === "Active" && m.physicalCardStatus !== "Released to Employee",
  ).length;
  const removalPending = members.filter((m) =>
    ["Pending Endorsement", "Endorsed", "For Processing"].includes(m.removalStatus),
  ).length;
  const latestBillingPeriod = billingPeriods[billingPeriods.length - 1];
  const expectedBilling = members
    .filter((m) => m.billingStatus === "Included in Billing")
    .reduce((sum, m) => sum + (m.monthlyPremium ?? 0), 0);
  const billingVariance = latestBillingPeriod
    ? expectedBilling - latestBillingPeriod.providerInvoiceAmount
    : 0;

  // --- Needs HR Action (SOP section 9) -------------------------------------
  const actionItems = useMemo(() => {
    const items: { label: string; count: number; tab: string }[] = [];
    if (becomingEligible > 0)
      items.push({
        label: "Becoming eligible within 30 days",
        count: becomingEligible,
        tab: "members",
      });
    if (pendingManagerEvaluation > 0)
      items.push({
        label: "Manager evaluation needed",
        count: pendingManagerEvaluation,
        tab: "queue",
      });
    const followUp = members.filter(
      (m) => m.enrollmentStatus === "Endorsed to ETIQA" && !m.hmoEffectivityDate,
    ).length;
    if (followUp > 0)
      items.push({
        label: "Endorsed to ETIQA, no effectivity date yet",
        count: followUp,
        tab: "queue",
      });
    if (physicalCardsPending > 0)
      items.push({
        label: "Physical card not yet released",
        count: physicalCardsPending,
        tab: "cards",
      });
    const removalRequired = members.filter(
      (m) =>
        (m.employmentStatus === "Resigned" || m.employmentStatus === "Terminated") &&
        m.memberStatus === "Active",
    ).length;
    if (removalRequired > 0)
      items.push({
        label: "Removal required (resigned/terminated, still active)",
        count: removalRequired,
        tab: "members",
      });
    const billingWarning = members.filter(
      (m) =>
        (m.memberStatus === "Inactive" || m.memberStatus === "Terminated") &&
        m.billingStatus === "Included in Billing",
    ).length;
    if (billingWarning > 0)
      items.push({
        label: "Inactive/removed member still in billing",
        count: billingWarning,
        tab: "billing",
      });
    return items;
  }, [members, becomingEligible, pendingManagerEvaluation, physicalCardsPending]);

  const [activeTab, setActiveTab] = useState("overview");
  const [exportingMembers, setExportingMembers] = useState(false);

  async function handleExportMembers(format: "csv" | "pdf") {
    if (filteredMembers.length === 0) {
      toast.error("No members to export.");
      return;
    }
    setExportingMembers(true);
    try {
      if (format === "csv") exportHmoMembersCsv(filteredMembers);
      else await exportHmoMembersPdf(filteredMembers);
      toast.success(
        `Exported ${filteredMembers.length} member${filteredMembers.length === 1 ? "" : "s"} as ${format.toUpperCase()}`,
      );
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExportingMembers(false);
    }
  }

  function updateMemberField(id: string, patch: Record<string, unknown>) {
    updateMemberMutation.mutate(
      { id, patch },
      {
        onError: (error) => {
          console.error(error);
          toast.error(error instanceof Error ? error.message : "Couldn't save that change.");
        },
      },
    );
  }

  if (accountLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="HMO Management" description="Employee Benefits." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-9 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="HMO Management" description="Employee Benefits." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No access</p>
              <p className="text-sm text-muted-foreground">
                Your account ({account ? ROLE_LABELS[account.role] : "signed out"}) doesn't have
                access to Employee Benefits. Ask a Super Admin to grant it from the permission
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
        title="HMO Management"
        description="Eligibility, enrollment, dependents, cards, billing and removal — the full HMO lifecycle."
        action={
          canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewRequestOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> New HMO Request
              </Button>
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add HMO Member
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          tone="positive"
          title="Active HMO Members"
          value={activeMembers}
          hint="ETIQA"
          icon={HeartPulse}
        />
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          title="Becoming Eligible"
          value={becomingEligible}
          hint="Within the next 30 days"
          icon={Calendar}
        />
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          tone="warning"
          title="Pending Manager Evaluation"
          value={pendingManagerEvaluation}
          hint="Reached eligibility, awaiting evaluation"
          icon={UserCheck}
        />
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          tone="warning"
          title="Pending Enrollment"
          value={pendingEnrollmentCount}
          hint="In the enrollment workflow"
          icon={Users}
        />
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          tone="warning"
          title="Pending Requirements"
          value={pendingRequirements}
          hint="Missing or incomplete requirements"
          icon={AlertCircle}
        />
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          tone="warning"
          title="Physical Cards Pending"
          value={physicalCardsPending}
          hint="Active members without a released card"
          icon={IdCard}
        />
        <MetricCard
          loading={membersLoading}
          unavailable={membersError}
          tone="warning"
          title="Removal Pending"
          value={removalPending}
          hint="Resigned/terminated members to remove"
          icon={UserMinus}
        />
        <MetricCard
          loading={billingLoading}
          unavailable={billingError}
          title="Billing Variance"
          value={`${billingVariance < 0 ? "-" : "+"}${formatCurrency(billingVariance)}`}
          hint="Expected vs. latest provider invoice"
          icon={Receipt}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="queue">Enrollment Queue</TabsTrigger>
            <TabsTrigger value="dependents">Dependents</TabsTrigger>
            <TabsTrigger value="members">HMO Members</TabsTrigger>
            <TabsTrigger value="cards">Card Tracking</TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              {requests.filter((r) => r.status === "Pending").length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                  {requests.filter((r) => r.status === "Pending").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>
        </div>

        {/* --- Overview --- */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Needs HR Action</CardTitle>
              <CardDescription>What to look at next, not just charts</CardDescription>
            </CardHeader>
            <CardContent>
              {actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => setActiveTab(item.tab)}
                      className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        {item.label}
                      </span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Enrollment Status</CardTitle>
                <CardDescription>All members by enrollment stage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {HMO_ENROLLMENT_STATUSES.map((s) => {
                  const count = members.filter((m) => m.enrollmentStatus === s).length;
                  const max = Math.max(1, members.length);
                  return (
                    <div key={s} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{s}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Member Status</CardTitle>
                <CardDescription>Principal and dependent members</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {["Not Yet Active", "Active", "Inactive", "Suspended", "Terminated"].map((s) => {
                  const count = members.filter((m) => m.memberStatus === s).length;
                  const max = Math.max(1, members.length);
                  return (
                    <div key={s} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{s}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- Enrollment Queue --- */}
        <TabsContent value="queue" className="space-y-4">
          <ListToolbar
            controls={queueControls}
            searchPlaceholder="Search name or department..."
            noun="members"
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Manager Evaluation</TableHead>
                      <TableHead>Enrollment Status</TableHead>
                      <TableHead>Eligibility Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableSkeletonRows columns={5} />
                    ) : queueControls.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          {queueControls.total === 0
                            ? "Nothing in the enrollment queue."
                            : "No members match your search or filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      queueControls.pageItems.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <Link
                              to="/hmo-management/$memberId"
                              params={{ memberId: m.id }}
                              className="hover:underline"
                            >
                              {m.displayName}
                            </Link>
                          </TableCell>
                          <TableCell>{m.department ?? "—"}</TableCell>
                          <TableCell>{m.managerEvaluation ?? "—"}</TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={m.enrollmentStatus}
                                onValueChange={(v) =>
                                  updateMemberField(m.id, { enrollmentStatus: v })
                                }
                              >
                                <SelectTrigger className="h-8 w-[190px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {HMO_ENROLLMENT_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={ENROLLMENT_STATUS_VARIANT[m.enrollmentStatus]}>
                                {m.enrollmentStatus}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(m.eligibilityDate)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager controls={queueControls} noun="members" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Dependents --- */}
        <TabsContent value="dependents" className="space-y-4">
          <ListToolbar
            controls={dependentsControls}
            searchPlaceholder="Search dependent or principal..."
            noun="dependents"
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dependent</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Principal Member</TableHead>
                      <TableHead>Birthday</TableHead>
                      <TableHead>Member Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableSkeletonRows columns={5} />
                    ) : dependentsControls.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          {dependentsControls.total === 0
                            ? "No dependents on file."
                            : "No dependents match your search or filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      dependentsControls.pageItems.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <Link
                              to="/hmo-management/$memberId"
                              params={{ memberId: d.id }}
                              className="hover:underline"
                            >
                              {d.displayName}
                            </Link>
                          </TableCell>
                          <TableCell>{d.relationshipToPrincipal ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {principalNameOf(d) ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(d.birthday)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={MEMBER_STATUS_VARIANT[d.memberStatus]}>
                              {d.memberStatus}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager controls={dependentsControls} noun="dependents" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- HMO Members --- */}
        <TabsContent value="members" className="space-y-4">
          <ListToolbar
            controls={membersControls}
            searchPlaceholder="Search name, department, card no..."
            noun="members"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exportingMembers}>
                  {exportingMembers ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={exportingMembers}
                  onSelect={() => handleExportMembers("csv")}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={exportingMembers}
                  onSelect={() => handleExportMembers("pdf")}
                >
                  <FileText className="mr-2 h-4 w-4" /> Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ListToolbar>

          {/* SOP section 6: keep this grid narrow, full detail lives on the
              member's own profile page (hmo-management.$memberId.tsx). */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Eligibility</TableHead>
                      <TableHead>Enrollment</TableHead>
                      <TableHead>Member Status</TableHead>
                      <TableHead>Coverage</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>Monthly Premium</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableSkeletonRows columns={9} />
                    ) : membersControls.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          {membersControls.total === 0
                            ? "No HMO members yet."
                            : "No members match your search or filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      membersControls.pageItems.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {m.displayName}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{m.department ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(m.eligibilityDate)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={ENROLLMENT_STATUS_VARIANT[m.enrollmentStatus]}>
                              {m.enrollmentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={MEMBER_STATUS_VARIANT[m.memberStatus]}>
                              {m.memberStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>{m.rank ?? "—"}</TableCell>
                          <TableCell>{m.physicalCardStatus}</TableCell>
                          <TableCell>
                            {m.monthlyPremium != null ? formatCurrency(m.monthlyPremium) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button asChild size="sm" variant="outline">
                                <Link to="/hmo-management/$memberId" params={{ memberId: m.id }}>
                                  View
                                </Link>
                              </Button>
                              {canManage && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Delete"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(m)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager controls={membersControls} noun="members" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Card Tracking --- */}
        <TabsContent value="cards" className="space-y-4">
          <ListToolbar
            controls={cardsControls}
            searchPlaceholder="Search member or card no..."
            noun="members"
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Virtual Card</TableHead>
                      <TableHead>Physical Card</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersLoading ? (
                      <TableSkeletonRows columns={3} />
                    ) : cardsControls.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          {cardsControls.total === 0
                            ? "No members to track cards for yet."
                            : "No members match your search or filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      cardsControls.pageItems.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {m.displayName}
                          </TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={m.virtualCardStatus}
                                onValueChange={(v) =>
                                  updateMemberField(m.id, {
                                    virtualCardStatus: v as HmoVirtualCardStatus,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-[170px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {HMO_VIRTUAL_CARD_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{m.virtualCardStatus}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={m.physicalCardStatus}
                                onValueChange={(v) =>
                                  updateMemberField(m.id, {
                                    physicalCardStatus: v as HmoPhysicalCardStatus,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-[190px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {HMO_PHYSICAL_CARD_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{m.physicalCardStatus}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager controls={cardsControls} noun="members" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Requests --- */}
        <TabsContent value="requests" className="space-y-4">
          <ListToolbar
            controls={requestsControls}
            searchPlaceholder="Search member, type or notes..."
            noun="requests"
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead className="w-40 text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestsControls.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={canManage ? 6 : 5}
                          className="h-24 text-center text-muted-foreground"
                        >
                          {requestsControls.total === 0
                            ? "No requests yet."
                            : "No requests match your search or filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      requestsControls.pageItems.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {memberById.get(r.memberId)?.displayName ?? "—"}
                          </TableCell>
                          <TableCell>{r.requestType}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(r.submittedDate)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                            {r.notes || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={REQUEST_STATUS_VARIANT[r.status]}>{r.status}</Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              {r.status === "Pending" ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateRequestMutation.mutate({ id: r.id, status: "Approved" })
                                    }
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() =>
                                      updateRequestMutation.mutate({ id: r.id, status: "Rejected" })
                                    }
                                  >
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {r.resolvedByName ?? "—"}
                                </span>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager controls={requestsControls} noun="requests" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Billing --- */}
        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" /> Monthly Billing
                </CardTitle>
                <CardDescription>
                  Expected member billing vs. actual provider invoice
                </CardDescription>
              </div>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setNewBillingOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Period
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b px-4 pb-4">
                <ListToolbar
                  controls={billingControls}
                  searchPlaceholder="Search month or notes..."
                  noun="periods"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Expected (Members Billed)</TableHead>
                      <TableHead>Provider Invoice</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingControls.pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          {billingControls.total === 0
                            ? "No billing periods recorded yet."
                            : "No billing periods match your search or filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      billingControls.pageItems.map((b) => {
                        const variance = expectedBilling - b.providerInvoiceAmount;
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{monthLabel(b.month)}</TableCell>
                            <TableCell>{formatCurrency(expectedBilling)}</TableCell>
                            <TableCell>{formatCurrency(b.providerInvoiceAmount)}</TableCell>
                            <TableCell
                              className={
                                variance < 0 ? "text-destructive" : "text-muted-foreground"
                              }
                            >
                              {variance === 0
                                ? "—"
                                : `${variance < 0 ? "-" : "+"}${formatCurrency(variance)}`}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {b.notes || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePager controls={billingControls} noun="periods" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <HmoMemberFormDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        principals={principals}
      />
      <NewHmoRequestDialog
        open={newRequestOpen}
        onOpenChange={setNewRequestOpen}
        members={members}
      />
      <NewBillingPeriodDialog open={newBillingOpen} onOpenChange={setNewBillingOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove this HMO member?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteTarget?.displayName || "this member"} from HMO
              Management, including their card, billing and request history.
              {deleteTargetDependentCount > 0 &&
                ` This also removes ${deleteTargetDependentCount} dependent${deleteTargetDependentCount === 1 ? "" : "s"} tied to them.`}{" "}
              This can't be undone, though the removal itself is logged in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteMember();
              }}
              disabled={deleteMemberMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMemberMutation.isPending ? "Removing..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function NewHmoRequestDialog({
  open,
  onOpenChange,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: HmoMember[];
}) {
  const [memberId, setMemberId] = useState("");
  const [requestType, setRequestType] = useState("");
  const [notes, setNotes] = useState("");
  const createMutation = useCreateHmoRequest();

  function reset() {
    setMemberId("");
    setRequestType("");
    setNotes("");
  }

  async function handleSubmit() {
    if (!memberId || !requestType.trim()) {
      toast.error("Choose a member and a request type.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        memberId,
        requestType: requestType.trim(),
        submittedDate: today(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast.success("Request submitted");
      onOpenChange(false);
      reset();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Couldn't submit this request.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New HMO Request</DialogTitle>
          <DialogDescription>
            LOA, reimbursement, card replacement or other benefit request.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Member</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hmo-req-type">Request Type</Label>
            <Input
              id="hmo-req-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              placeholder="e.g. Reimbursement, Card Replacement..."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hmo-req-notes">Notes (optional)</Label>
            <Textarea id="hmo-req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewBillingPeriodDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [month, setMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const createMutation = useCreateHmoBillingPeriod();

  function reset() {
    setMonth("");
    setAmount("");
    setNotes("");
  }

  async function handleSubmit() {
    if (!month || !amount) {
      toast.error("Enter the billing month and the provider's invoice amount.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        month: `${month}-01`,
        providerInvoiceAmount: Number(amount),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      toast.success("Billing period recorded");
      onOpenChange(false);
      reset();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Couldn't record this billing period.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Billing Period</DialogTitle>
          <DialogDescription>
            Record what the provider actually billed for a month.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="hmo-bill-month">Month</Label>
            <Input
              id="hmo-bill-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hmo-bill-amount">Provider Invoice Amount</Label>
            <Input
              id="hmo-bill-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hmo-bill-notes">Notes (optional)</Label>
            <Textarea
              id="hmo-bill-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Add Period"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
