// Super Admin-only module: on-demand or scheduled Postgres database backups,
// downloadable as .sql files — see backend/app/api/routes/backups.py and
// backend/app/services/backup.py (a real `pg_dump`, not a hand-rolled
// exporter). Gated stricter than every other admin page in this app
// (isSuperAdminRole, not isFullAccessRole/isAdmin) since a database dump is
// a strictly more sensitive artifact than anything else an Admin can reach.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseBackup as DatabaseBackupIcon,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingPulse } from "@/components/loading-pulse";
import { MetricCard } from "@/components/metric-card";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Backup, BackupFrequency } from "@/data/backup-api";
import { backupDownloadUrl } from "@/data/backup-api";
import {
  useBackupsQuery,
  useBackupScheduleQuery,
  useBackupTablesQuery,
  useDeleteBackup,
  useRunBackup,
  useUpdateBackupSchedule,
} from "@/data/backup-store";
import { MANAGE_PASSWORD } from "@/lib/manage-password";
import { getEffectiveRole, isSuperAdminRole } from "@/lib/permissions";
import { useCurrentAccount } from "@/lib/session";

export const Route = createFileRoute("/database-backups")({
  head: () => ({
    meta: [
      { title: "Database Backups — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content: "Super Admin-only: on-demand and scheduled database backups.",
      },
    ],
  }),
  component: DatabaseBackupsPage,
});

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ backup }: { backup: Backup }) {
  if (backup.status === "running") {
    return (
      <Badge
        variant="outline"
        className="border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400"
      >
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  }
  if (backup.status === "failed") {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        <XCircle className="mr-1 h-3 w-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    >
      <CheckCircle2 className="mr-1 h-3 w-3" /> Completed
    </Badge>
  );
}

function DatabaseBackupsPage() {
  const { data: account, isLoading: accountLoading } = useCurrentAccount();
  const isSuperAdmin = isSuperAdminRole(getEffectiveRole(account));

  const {
    data: backups = [],
    isLoading: backupsLoading,
    isError: backupsError,
  } = useBackupsQuery();
  const { data: tables = [] } = useBackupTablesQuery();
  const { data: schedule } = useBackupScheduleQuery();
  const runBackupMutation = useRunBackup();
  const deleteBackupMutation = useDeleteBackup();
  const updateScheduleMutation = useUpdateBackupSchedule();

  const [runTables, setRunTables] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState(false);

  // Local draft of the schedule form — only synced from the fetched
  // schedule once, on first load, so typing/toggling doesn't get clobbered
  // by the 60s-old value a refetch might bring back mid-edit.
  const [scheduleDraft, setScheduleDraft] = useState<{
    enabled: boolean;
    frequency: BackupFrequency;
    dayOfWeek: number;
    time: string;
    tables: string[];
  } | null>(null);

  if (schedule && scheduleDraft === null) {
    setScheduleDraft({
      enabled: schedule.enabled,
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek ?? 0,
      time: schedule.timeOfDay.slice(0, 5),
      tables: schedule.tables ?? [],
    });
  }

  if (accountLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Database Backups" description="Snapshot and restore your data." />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Database Backups" description="Snapshot and restore your data." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Super Admins only</p>
              <p className="text-sm text-muted-foreground">
                Database backups contain a full copy of every table's data — this page is restricted
                beyond the usual Admin access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleRunBackup() {
    try {
      await runBackupMutation.mutateAsync(runTables.length > 0 ? runTables : null);
      toast.success("Backup started — it'll show up below once it finishes.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Couldn't start the backup.");
    }
  }

  async function saveSchedule(next: NonNullable<typeof scheduleDraft>) {
    setScheduleDraft(next);
    try {
      await updateScheduleMutation.mutateAsync({
        enabled: next.enabled,
        frequency: next.frequency,
        dayOfWeek: next.frequency === "weekly" ? next.dayOfWeek : null,
        timeOfDay: `${next.time}:00`,
        tables: next.tables.length > 0 ? next.tables : null,
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Couldn't save the schedule.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deletePassword !== MANAGE_PASSWORD) {
      setDeletePasswordError(true);
      return;
    }
    try {
      await deleteBackupMutation.mutateAsync(deleteTarget.id);
      toast.success("Backup deleted");
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Couldn't delete that backup.");
    } finally {
      setDeletePassword("");
      setDeletePasswordError(false);
    }
  }

  const completed = backups.filter((b) => b.status === "completed");
  const failed = backups.filter((b) => b.status === "failed");
  const lastCompleted = completed[0] ?? null;
  // The manual route only *queues* a backup now — the worker executes it
  // within ~60s (see backend/app/services/backup.py) — so "is it running"
  // has to come from the polled list, not just the POST request's own
  // (now near-instant) pending state.
  const backupRunning = runBackupMutation.isPending || backups.some((b) => b.status === "running");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Database Backups"
        description="Snapshot the database on demand or on a schedule, then download the .sql file — the real Postgres export tool (pg_dump), not a partial copy."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MetricCard
          loading={backupsLoading}
          unavailable={backupsError}
          title="Backups on file"
          value={completed.length}
          hint="Downloadable now"
          icon={DatabaseBackupIcon}
        />
        <MetricCard
          loading={backupsLoading}
          unavailable={backupsError}
          title="Last successful"
          value={lastCompleted ? formatDateTime(lastCompleted.completedAt) : "None yet"}
          hint={lastCompleted ? `${formatBytes(lastCompleted.fileSizeBytes)}` : "Run one below"}
          icon={CheckCircle2}
        />
        <MetricCard
          loading={backupsLoading}
          unavailable={backupsError}
          tone="danger"
          title="Failed runs"
          value={failed.length}
          hint={failed.length > 0 ? "See status column below" : "None"}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Backup now</CardTitle>
            <CardDescription>
              Leave tables unselected to back up everything, or pick specific ones for a smaller
              snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {backupRunning ? (
              <LoadingPulse
                icon={DatabaseBackupIcon}
                title="Backing up your database..."
                subtitle="Queued for the worker — usually done within a minute"
              />
            ) : (
              <>
                <MultiSelectFilter
                  label="Tables"
                  selected={runTables}
                  onChange={setRunTables}
                  options={tables}
                />
                <Button onClick={handleRunBackup}>
                  <DatabaseBackupIcon className="mr-2 h-4 w-4" />
                  Backup Now
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automatic backups</CardTitle>
            <CardDescription>
              Runs unattended on the schedule below — all times are UTC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {scheduleDraft && (
              <>
                <div className="flex items-center justify-between">
                  <Label htmlFor="schedule-enabled">Enabled</Label>
                  <Switch
                    id="schedule-enabled"
                    checked={scheduleDraft.enabled}
                    onCheckedChange={(checked) =>
                      saveSchedule({ ...scheduleDraft, enabled: checked })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Frequency</Label>
                    <Select
                      value={scheduleDraft.frequency}
                      onValueChange={(v) =>
                        saveSchedule({ ...scheduleDraft, frequency: v as BackupFrequency })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Time (UTC)</Label>
                    <Input
                      type="time"
                      value={scheduleDraft.time}
                      onChange={(e) => saveSchedule({ ...scheduleDraft, time: e.target.value })}
                    />
                  </div>
                </div>
                {scheduleDraft.frequency === "weekly" && (
                  <div className="grid gap-2">
                    <Label>Day of week</Label>
                    <Select
                      value={String(scheduleDraft.dayOfWeek)}
                      onValueChange={(v) =>
                        saveSchedule({ ...scheduleDraft, dayOfWeek: Number(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_LABELS.map((label, i) => (
                          <SelectItem key={label} value={String(i)}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Tables</Label>
                  <MultiSelectFilter
                    label="Tables"
                    selected={scheduleDraft.tables}
                    onChange={(next) => saveSchedule({ ...scheduleDraft, tables: next })}
                    options={tables}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {schedule?.lastRunAt
                    ? `Last ran ${formatDateTime(schedule.lastRunAt)}. The last 14 automatic backups are kept — older ones are pruned automatically.`
                    : "Hasn't run yet. The last 14 automatic backups are kept — older ones are pruned automatically."}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Snapshots</CardTitle>
          <CardDescription>Every backup that's run, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!backupsLoading && backups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No backups yet — run one above.
                    </TableCell>
                  </TableRow>
                )}
                {backups.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <StatusBadge backup={b} />
                      {b.status === "failed" && b.errorMessage && (
                        <p
                          className="mt-1 max-w-xs truncate text-xs text-destructive"
                          title={b.errorMessage}
                        >
                          {b.errorMessage}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {b.trigger === "scheduled" ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Scheduled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /> Manual
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.tables ? b.tables.join(", ") : "All tables"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatBytes(b.fileSizeBytes)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.requestedByLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(b.startedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {b.status === "completed" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => window.open(backupDownloadUrl(b.id), "_blank")}
                            aria-label={`Download ${b.fileName ?? "backup"}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(b)}
                          aria-label={`Delete ${b.fileName ?? "backup"}`}
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
        </CardContent>
      </Card>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
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
            <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes {deleteTarget?.fileName ?? "this snapshot"}. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-1">
            <Label htmlFor="backup-delete-password">Confirm with password</Label>
            <Input
              id="backup-delete-password"
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
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteBackupMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBackupMutation.isPending ? "Deleting..." : "Confirm & Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
