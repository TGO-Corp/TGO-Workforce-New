import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Briefcase,
  FileText,
  Landmark,
  Lock,
  Pencil,
  Phone as PhoneIcon,
  Search,
  ShieldCheck,
  Trash2,
  User,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreatableComboboxField } from "@/components/creatable-combobox-field";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEmployees, useUpdateEmployee, useDeleteEmployee } from "@/data/employee-store";
import {
  EMPLOYMENT_TYPES,
  OFFICES,
  STATUSES,
  WORK_ARRANGEMENTS,
  formatDate,
  type Employee,
  type EmployeeStatus,
} from "@/data/employees";
import { useListOptionsQuery } from "@/data/list-options-store";
import { MANAGE_PASSWORD } from "@/lib/manage-password";

type SortKey = "id" | "name" | "office" | "department" | "position" | "birthday" | "status";

const statusVariant: Record<EmployeeStatus, "default" | "secondary" | "destructive"> = {
  Active: "default",
  Resigned: "secondary",
  Terminated: "destructive",
};

export function ManageEmployeesDialog() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const rows = useEmployees();
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  const [editing, setEditing] = useState<Employee | null>(null);
  // The id the record had when its edit dialog opened — always the PATCH
  // URL, since the Employee ID field below is now editable and pendingSave
  // may carry a *different* id than the one this record is actually stored
  // under.
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<Employee | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? rows
      : rows.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q) ||
            e.position.toLowerCase().includes(q) ||
            e.department.toLowerCase().includes(q),
        );
    return [...matched].sort((a, b) => {
      const av = String(a[sort.key as keyof Employee] ?? "");
      const bv = String(b[sort.key as keyof Employee] ?? "");
      return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [rows, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({
      key,
      dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
    }));

  function handleUnlock() {
    if (password === MANAGE_PASSWORD) {
      setUnlocked(true);
      setPasswordError(false);
      setPassword("");
    } else {
      setPasswordError(true);
    }
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset the gate every time the dialog closes.
      setUnlocked(false);
      setPassword("");
      setPasswordError(false);
      setQuery("");
      setEditing(null);
      setEditingOriginalId(null);
      setPendingDelete(null);
      setDeletePassword("");
      setDeletePasswordError(false);
    }
  }

  // Editing captures the change, but doesn't commit it — that happens after
  // the confirmation step below, so a save always requires a deliberate second click.
  function requestSave(updated: Employee) {
    const trimmedId = updated.id.trim();
    if (!trimmedId) {
      toast.error("Employee ID can't be empty");
      return;
    }
    setEditing(null);
    setPendingSave({ ...updated, id: trimmedId });
  }

  async function confirmSave() {
    if (!pendingSave || !editingOriginalId) return;
    try {
      await updateMutation.mutateAsync({
        originalId: editingOriginalId,
        employee: pendingSave,
      });
      toast.success(`${pendingSave.name} updated`);
      setEditingOriginalId(null);
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't save changes to ${pendingSave.name}. Please try again.`);
    } finally {
      setPendingSave(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    // A password prompt on every delete, not just once to unlock this whole
    // screen — see src/lib/manage-password.ts.
    if (deletePassword !== MANAGE_PASSWORD) {
      setDeletePasswordError(true);
      return;
    }
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success(`${pendingDelete.name} removed`);
    } catch (error) {
      console.error(error);
      toast.error(`Couldn't remove ${pendingDelete.name}. Please try again.`);
    } finally {
      setPendingDelete(null);
      setDeletePassword("");
      setDeletePasswordError(false);
    }
  }

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary/80"
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60" />
    </button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Users className="mr-2 h-4 w-4" /> Manage Employees
          </Button>
        </DialogTrigger>

        {!unlocked ? (
          <DialogContent className="sm:max-w-sm">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Manage Employees</h2>
                <p className="text-sm text-muted-foreground">
                  Enter the workspace password to edit or remove employee records.
                </p>
              </div>
              <div className="grid w-full gap-2 pt-2 text-left">
                <Label htmlFor="manage-password">Password</Label>
                <Input
                  id="manage-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  autoFocus
                />
                {passwordError && (
                  <p className="text-xs text-destructive">Incorrect password. Try again.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleUnlock}>Unlock</Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent className="flex max-h-[92vh] w-[98vw] max-w-[1800px] flex-col overflow-hidden p-0">
            <div className="space-y-3 border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold">Manage Employees</h2>
                <p className="text-sm text-muted-foreground">
                  Edit or remove records. Changes save immediately.
                </p>
              </div>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, ID, position or department..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary/5 hover:bg-primary/5">
                    <TableHead>
                      <SortHeader label="Employee ID" sortKey="id" />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Full Name" sortKey="name" />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Office" sortKey="office" />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Department" sortKey="department" />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Position" sortKey="position" />
                      <div className="text-xs font-normal text-muted-foreground">Levels</div>
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Birthday" sortKey="birthday" />
                    </TableHead>
                    <TableHead>
                      <SortHeader label="Status" sortKey="status" />
                    </TableHead>
                    <TableHead className="sticky right-0 bg-primary/5 text-primary shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No employees match your search.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.id}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{e.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.office}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.department}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div>{e.position}</div>
                        <div className="text-xs text-muted-foreground">{e.level || "—"}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(e.birthday)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[e.status]}>{e.status}</Badge>
                      </TableCell>
                      <TableCell className="sticky right-0 bg-background shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(e);
                              setEditingOriginalId(e.id);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-7 w-7"
                            onClick={() => setPendingDelete(e)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t px-6 py-3">
              <p className="text-sm text-muted-foreground">
                Showing {filtered.length} of {rows.length} employees
              </p>
              <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {editing && (
        <EditEmployeeDialog
          employee={editing}
          onCancel={() => {
            setEditing(null);
            setEditingOriginalId(null);
          }}
          onRequestSave={requestSave}
        />
      )}

      <AlertDialog open={!!pendingSave} onOpenChange={(o) => !o && setPendingSave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Save changes to {pendingSave?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSave && editingOriginalId && pendingSave.id !== editingOriginalId
                ? `This also renames the Employee ID from ${editingOriginalId} to ${pendingSave.id}.`
                : "Please confirm you want to apply these changes to this employee's record."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditing(pendingSave)}>
              Back to edit
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Confirm & Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) {
            setPendingDelete(null);
            setDeletePassword("");
            setDeletePasswordError(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {pendingDelete?.id} from the directory. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-1">
            <Label htmlFor="delete-password">Confirm with password</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value);
                setDeletePasswordError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
              autoFocus
            />
            {deletePasswordError && <p className="text-xs text-destructive">Incorrect password.</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Prevent the default auto-close so a wrong password
                // re-shows the error instead of dismissing the dialog —
                // confirmDelete closes it once the password checks out.
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Removing..." : "Confirm & Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A section heading matching the grouped-fields layout shared with
 * NewHireDialog (new-hire-dialog.tsx) — Personal/Employment/Company
 * Accounts/Emergency Contact/Additional Information. */
function SectionHeading({ icon: Icon, label }: { icon: typeof User; label: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
      <Icon className="h-4 w-4" /> {label}
    </h3>
  );
}

function EditEmployeeDialog({
  employee,
  onCancel,
  onRequestSave,
}: {
  employee: Employee;
  onCancel: () => void;
  onRequestSave: (updated: Employee) => void;
}) {
  const [form, setForm] = useState<Employee>(employee);
  const { data: listOptions } = useListOptionsQuery();

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-b px-6 py-4">
          <h2 className="text-base font-semibold">Edit Employee Record</h2>
          <p className="text-sm text-muted-foreground">{employee.name}</p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <SectionHeading icon={User} label="Personal Information" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="edit-id">Employee ID</Label>
                <Input
                  id="edit-id"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Used as this record's identifier in Activity Logs and Excel/CSV imports — change
                  it only to fix a mistake. Must be unique.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-preferred-name">Preferred Name / Nickname</Label>
                <Input
                  id="edit-preferred-name"
                  value={form.preferredName ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, preferredName: e.target.value || undefined })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-phone">Phone Number</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value || undefined })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-personal-email">Personal Email</Label>
                <Input
                  id="edit-personal-email"
                  type="email"
                  value={form.personalEmail ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, personalEmail: e.target.value || undefined })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-birthday">Birthday</Label>
                <Input
                  id="edit-birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-address">Residential Address</Label>
                <Input
                  id="edit-address"
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={Briefcase} label="Employment Information" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Office Location</Label>
                <Select value={form.office} onValueChange={(v) => setForm({ ...form, office: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Departments</Label>
                <CreatableComboboxField
                  label="Department"
                  listKey="departments"
                  options={listOptions?.departments ?? []}
                  value={form.department}
                  onChange={(v) => setForm({ ...form, department: v })}
                  placeholder="Select department"
                />
              </div>

              <div className="grid gap-2">
                <Label>Position</Label>
                <CreatableComboboxField
                  label="Position"
                  listKey="positions"
                  options={listOptions?.positions ?? []}
                  value={form.position}
                  onChange={(v) => setForm({ ...form, position: v })}
                  placeholder="Select position"
                />
              </div>

              <div className="grid gap-2">
                <Label>Levels</Label>
                <CreatableComboboxField
                  label="Level"
                  listKey="levels"
                  options={listOptions?.levels ?? []}
                  value={form.level}
                  onChange={(v) => setForm({ ...form, level: v })}
                  placeholder="Select level"
                />
              </div>

              <div className="grid gap-2">
                <Label>Employment Type</Label>
                <Select
                  value={form.employmentType ?? ""}
                  onValueChange={(v) => setForm({ ...form, employmentType: v || undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Work Arrangement</Label>
                <Select
                  value={form.workArrangement ?? ""}
                  onValueChange={(v) => setForm({ ...form, workArrangement: v || undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select work arrangement" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_ARRANGEMENTS.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="edit-supervisor">Direct Supervisor / Manager</Label>
                <Input
                  id="edit-supervisor"
                  value={form.supervisor ?? ""}
                  onChange={(e) => setForm({ ...form, supervisor: e.target.value || undefined })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-job-offer-date">Job Offer Date</Label>
                <Input
                  id="edit-job-offer-date"
                  type="date"
                  value={form.jobOfferDate ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      jobOfferDate: e.target.value || undefined,
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as EmployeeStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-exit">Exit Date</Label>
                <Input
                  id="edit-exit"
                  type="date"
                  value={form.exitDate ?? ""}
                  onChange={(e) => setForm({ ...form, exitDate: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={Landmark} label="Company Accounts" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-tgo-email">TGO Email Address</Label>
                <Input
                  id="edit-tgo-email"
                  type="email"
                  value={form.tgoEmail ?? ""}
                  onChange={(e) => setForm({ ...form, tgoEmail: e.target.value || undefined })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-lms-email">LMS Email Address (if applicable)</Label>
                <Input
                  id="edit-lms-email"
                  type="email"
                  value={form.lmsEmail ?? ""}
                  onChange={(e) => setForm({ ...form, lmsEmail: e.target.value || undefined })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-vonage">Vonage Extension</Label>
                <Input
                  id="edit-vonage"
                  value={form.vonageExtension ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, vonageExtension: e.target.value || undefined })
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={PhoneIcon} label="Emergency Contact" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-ec-name">Emergency Contact Name</Label>
                <Input
                  id="edit-ec-name"
                  value={form.emergencyContactName ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactName: e.target.value || undefined })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-ec-relationship">Relationship</Label>
                <Input
                  id="edit-ec-relationship"
                  value={form.emergencyContactRelationship ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      emergencyContactRelationship: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-ec-number">Emergency Contact Number</Label>
                <Input
                  id="edit-ec-number"
                  type="tel"
                  value={form.emergencyContactNumber ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactNumber: e.target.value || undefined })
                  }
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={FileText} label="Additional Information" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="edit-reason-for-separation">Reason for Separation</Label>
                <Input
                  id="edit-reason-for-separation"
                  value={form.reasonForSeparation ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, reasonForSeparation: e.target.value || undefined })
                  }
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="edit-hr-remarks">HR Remarks</Label>
                <Input
                  id="edit-hr-remarks"
                  value={form.hrRemarks ?? ""}
                  onChange={(e) => setForm({ ...form, hrRemarks: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onRequestSave(form)}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
