import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Trash2,
  X,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkFixDialog } from "@/components/bulk-fix-dialog";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { EmployeeNameLink } from "@/components/employee-name-link";
import { ImportEmployeesDialog } from "@/components/import-employees-dialog";
import { ManageEmployeesDialog } from "@/components/manage-employees-dialog";
import { NewHireDialog } from "@/components/new-hire-dialog";
import { useBulkDeleteEmployees, useEmployees } from "@/data/employee-store";
import { useListOptionsQuery } from "@/data/list-options-store";
import { useCurrentAccount } from "@/lib/session";
import { canManageEmployees, getEffectiveRole, isSuperAdminRole } from "@/lib/permissions";
import {
  DEPARTMENTS,
  OFFICES,
  STATUSES,
  formatDate,
  isInTraining,
  tenure,
  tenureDays,
  type Employee,
  type EmployeeStatus,
} from "@/data/employees";
import {
  exportEmployeesCsv,
  exportEmployeesDetailedXlsx,
  exportEmployeesPdf,
  exportEmployeesXlsx,
  exportWorkforceSummaryXlsx,
} from "@/lib/export";
import { MANAGE_PASSWORD } from "@/lib/manage-password";

type SortKey = "id" | "name" | "office" | "department" | "position" | "startDate" | "status";

const statusVariant: Record<EmployeeStatus, "default" | "secondary" | "destructive"> = {
  Active: "default",
  Resigned: "secondary",
  Terminated: "destructive",
};

const PAGE_SIZE = 8;

// A pseudo-value in the Level filter (like "Training" is for Status below)
// standing in for "level is blank" — Level has no default value anymore (see
// the employees.level model comment), so without this there'd be no way to
// filter for the employees who still need one set by hand.
const UNSET_LEVEL = "No level yet";

export function EmployeeTable() {
  const employees = useEmployees();
  const bulkDeleteMutation = useBulkDeleteEmployees();
  const { data: account } = useCurrentAccount();
  // Level has no fixed preset list (unlike office/status) — it's a plain
  // free-text field admins manage via /list-options, same as department and
  // position, so the filter's option set has to come from there live rather
  // than a hardcoded array.
  const { data: listOptions } = useListOptionsQuery();
  // A viewer can search/filter/sort/paginate/export like everyone else, but
  // every button that creates/edits/deletes/imports employee records — and
  // the row-selection checkboxes that only exist to feed bulk-delete — are
  // hidden for them. The backend enforces the same rule on every write
  // route (see backend/app/core/auth.py's require_employee_writer), so this
  // is a UX nicety, not the actual security boundary.
  const canManage = canManageEmployees(account?.permissions);
  // Bulk Fix is deliberately stricter than canManage above — it can rewrite
  // Department/Position/Level/Birthday across many records at once from an
  // uploaded file, so it's reachable only for a genuine Super Admin (not
  // just anyone the permission matrix grants employees.manage to). Same UX-
  // nicety caveat as canManage: the PATCH it drives still only requires
  // employees.manage server-side, which every Super Admin already has.
  const isSuperAdmin = isSuperAdminRole(getEffectiveRole(account));
  const [query, setQuery] = useState("");
  // Empty array = no filter applied (matches every value) — see
  // MultiSelectFilter's doc comment. Multiple values can be checked at once
  // (e.g. Active + Terminated together), unlike the old single-choice Select.
  const [office, setOffice] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [department, setDepartment] = useState<string[]>([]);
  const [level, setLevel] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState("");
  const [bulkDeletePasswordError, setBulkDeletePasswordError] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters, sort, employees (create/delete/import/edit) and even a manual
  // refetch (the 15s realtime poll) all need to recompute this — leaving any
  // of them out of the dependency array is exactly what caused the table to
  // show stale rows until an unrelated filter click forced a re-render.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = employees.filter((e) => {
      const matchesQuery =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q);
      const matchesStatus =
        status.length === 0 ||
        status.some((s) => (s === "Training" ? isInTraining(e) : e.status === s));
      const matchesLevel =
        level.length === 0 || level.some((l) => (l === UNSET_LEVEL ? !e.level : e.level === l));
      return (
        matchesQuery &&
        (office.length === 0 || office.includes(e.office)) &&
        matchesStatus &&
        (department.length === 0 || department.includes(e.department)) &&
        matchesLevel
      );
    });
    return [...rows].sort((a, b) => {
      const av = String(a[sort.key as keyof Employee] ?? "");
      const bv = String(b[sort.key as keyof Employee] ?? "");
      return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [employees, query, office, status, department, level, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Drop any selected id that no longer exists (deleted elsewhere, or by
  // this same bulk action) so the "N selected" count and the header
  // checkbox's indeterminate state never drift from reality.
  useEffect(() => {
    setSelected((prev) => {
      const validIds = new Set(employees.map((e) => e.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [employees]);

  const toggleSort = (key: SortKey) => {
    setPage(1);
    setSort((s) => ({
      key,
      dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
    }));
  };

  // A brand-new hire otherwise lands wherever alphabetical order (the
  // default sort) puts them, possibly several pages deep or hidden behind
  // whatever filters happened to be set — so surface it immediately: sort
  // newest-first, clear anything that could be hiding the row just added,
  // and jump back to page 1.
  function handleNewHireCreated() {
    setSort({ key: "startDate", dir: "desc" });
    setQuery("");
    setOffice([]);
    setStatus([]);
    setDepartment([]);
    setLevel([]);
    setPage(1);
  }

  const allOnPageSelected = rows.length > 0 && rows.every((e) => selected.has(e.id));
  const someOnPageSelected = rows.some((e) => selected.has(e.id));

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of rows) {
        if (checked) next.add(e.id);
        else next.delete(e.id);
      }
      return next;
    });
  }

  async function confirmBulkDelete() {
    // A password prompt before any delete — see src/lib/manage-password.ts —
    // so a bulk removal from the Directory table always requires a
    // deliberate second step, the same as it does inside Manage Employees.
    if (bulkDeletePassword !== MANAGE_PASSWORD) {
      setBulkDeletePasswordError(true);
      return;
    }
    const ids = [...selected];
    try {
      const result = await bulkDeleteMutation.mutateAsync(ids);
      toast.success(`Removed ${result.deleted} employee${result.deleted === 1 ? "" : "s"}`);
      if (result.notFound.length > 0) {
        toast.error(`${result.notFound.length} selected row(s) were already removed elsewhere`);
      }
      setSelected(new Set());
    } catch (error) {
      console.error(error);
      toast.error("Couldn't delete the selected employees. Please try again.");
    } finally {
      setConfirmingBulkDelete(false);
      setBulkDeletePassword("");
      setBulkDeletePasswordError(false);
    }
  }

  // "Export Options" respects the checkbox selection: with rows checked, it
  // exports just those; with nothing checked, it exports everything the
  // current filters match — same selection semantics as bulk delete.
  const exportRows = selected.size > 0 ? filtered.filter((e) => selected.has(e.id)) : filtered;
  const exportScopeLabel =
    selected.size > 0 ? `Selected (${selected.size})` : `All (${filtered.length})`;

  async function handleExport(format: "csv" | "xlsx" | "pdf") {
    if (exportRows.length === 0) {
      toast.error("No employees to export.");
      return;
    }
    setExporting(true);
    try {
      if (format === "csv") exportEmployeesCsv(exportRows);
      else if (format === "xlsx") await exportEmployeesXlsx(exportRows);
      else await exportEmployeesPdf(exportRows);
      toast.success(
        `Exported ${exportRows.length} employee${exportRows.length === 1 ? "" : "s"} as ${format.toUpperCase()}`,
      );
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // The three reference-format exports (Filtered / Detailed / Summary) — see
  // src/lib/export.ts for the column layout each one matches. "Filtered"
  // follows the same selection-then-filters scope as the CSV/Excel/PDF
  // exports above; "Detailed" always covers every employee in the directory
  // regardless of filters, since it's meant as the full-roster record;
  // "Summary" is a grouped rollup of whatever the current filters show.
  async function handleDetailedExport(scope: "filtered" | "all") {
    const rows = scope === "filtered" ? exportRows : employees;
    if (rows.length === 0) {
      toast.error("No employees to export.");
      return;
    }
    setExporting(true);
    try {
      await exportEmployeesDetailedXlsx(
        rows,
        scope === "filtered" ? "TGO_Workforce_Filtered_Export" : "TGO_Workforce_Detailed_Export",
      );
      toast.success(`Exported ${rows.length} employee${rows.length === 1 ? "" : "s"}`);
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSummaryExport() {
    if (filtered.length === 0) {
      toast.error("No employees to summarize.");
      return;
    }
    setExporting(true);
    try {
      await exportWorkforceSummaryXlsx(filtered, "TGO_Workforce_Summary_Export");
      toast.success("Exported workforce summary");
    } catch (error) {
      console.error(error);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const SortButton = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, ID or position..."
            className="pl-9"
          />
        </div>

        <MultiSelectFilter
          label="Office"
          selected={office}
          onChange={(v) => {
            setOffice(v);
            setPage(1);
          }}
          options={[...OFFICES]}
        />
        <MultiSelectFilter
          label="Status"
          selected={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[...STATUSES, "Training"]}
        />
        <MultiSelectFilter
          label="Department"
          selected={department}
          onChange={(v) => {
            setDepartment(v);
            setPage(1);
          }}
          options={[...DEPARTMENTS]}
        />
        <MultiSelectFilter
          label="Level"
          selected={level}
          onChange={(v) => {
            setLevel(v);
            setPage(1);
          }}
          options={[UNSET_LEVEL, ...(listOptions?.levels ?? [])]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <>
            <ManageEmployeesDialog />
            <NewHireDialog onCreated={handleNewHireCreated} />
            <ImportEmployeesDialog />
          </>
        )}
        {isSuperAdmin && <BulkFixDialog />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Options
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("csv")}>
              Export {exportScopeLabel} as CSV
            </DropdownMenuItem>
            <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("xlsx")}>
              Export {exportScopeLabel} as Excel
            </DropdownMenuItem>
            <DropdownMenuItem disabled={exporting} onSelect={() => handleExport("pdf")}>
              Export {exportScopeLabel} as PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Reference report formats
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={exporting}
              onSelect={() => handleDetailedExport("filtered")}
            >
              Filtered Export ({exportScopeLabel})
            </DropdownMenuItem>
            <DropdownMenuItem disabled={exporting} onSelect={() => handleDetailedExport("all")}>
              Detailed Export (All {employees.length})
            </DropdownMenuItem>
            <DropdownMenuItem disabled={exporting} onSelect={handleSummaryExport}>
              Summary Export (by Team &amp; Office)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {canManage && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <p className="text-sm font-medium">
            {selected.size} employee{selected.size === 1 ? "" : "s"} selected
          </p>
          <Button variant="destructive" size="sm" onClick={() => setConfirmingBulkDelete(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="mr-2 h-4 w-4" /> Clear selection
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false
                        }
                        onCheckedChange={(checked) => togglePage(checked === true)}
                        aria-label="Select all rows on this page"
                      />
                    </TableHead>
                  )}
                  <TableHead>
                    <SortButton label="Employee ID" sortKey="id" />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Full Name" sortKey="name" />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Office" sortKey="office" />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Department" sortKey="department" />
                  </TableHead>
                  <TableHead>
                    <SortButton label="Position" sortKey="position" />
                    <div className="text-xs font-normal text-muted-foreground">Levels</div>
                  </TableHead>
                  <TableHead>
                    <SortButton label="Start Date" sortKey="startDate" />
                  </TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>
                    <SortButton label="Status" sortKey="status" />
                  </TableHead>
                  <TableHead>Exit Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 10 : 9}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No employees match the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((e) => (
                  <TableRow key={e.id} data-state={selected.has(e.id) ? "selected" : undefined}>
                    {canManage && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(e.id)}
                          onCheckedChange={(checked) => toggleRow(e.id, checked === true)}
                          aria-label={`Select ${e.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{e.id}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar employee={e} />
                        <EmployeeNameLink employee={e} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{e.office}</TableCell>
                    <TableCell className="whitespace-nowrap">{e.department}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{e.position}</div>
                      <div className="text-xs text-muted-foreground">{e.level || "—"}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(e.startDate)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{tenure(e.startDate, e.exitDate)}</div>
                      <div className="text-xs text-muted-foreground">
                        {tenureDays(e.startDate, e.exitDate)} days
                      </div>
                    </TableCell>
                    <TableCell>
                      {isInTraining(e) ? (
                        <Badge
                          variant="outline"
                          className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        >
                          Training
                        </Badge>
                      ) : (
                        <Badge variant={statusVariant[e.status]}>{e.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(e.exitDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} of {filtered.length} employees
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

      <AlertDialog
        open={confirmingBulkDelete}
        onOpenChange={(next) => {
          setConfirmingBulkDelete(next);
          if (!next) {
            setBulkDeletePassword("");
            setBulkDeletePasswordError(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>
              Delete {selected.size} employee{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {selected.size} record
              {selected.size === 1 ? "" : "s"} from the directory. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-1">
            <Label htmlFor="bulk-delete-password">Confirm with password</Label>
            <Input
              id="bulk-delete-password"
              type="password"
              value={bulkDeletePassword}
              onChange={(e) => {
                setBulkDeletePassword(e.target.value);
                setBulkDeletePasswordError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && confirmBulkDelete()}
              autoFocus
            />
            {bulkDeletePasswordError && (
              <p className="text-xs text-destructive">Incorrect password.</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // The default Action behavior closes the dialog on click —
                // prevent that so a wrong password re-shows the error
                // instead of dismissing; confirmBulkDelete closes it itself
                // once the password checks out and the delete finishes.
                e.preventDefault();
                confirmBulkDelete();
              }}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Confirm & Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
