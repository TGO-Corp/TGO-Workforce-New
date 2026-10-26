// API keys: list, create (the full key is shown exactly once), revoke, delete.

import { useState } from "react";
import { Ban, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
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
import {
  CodeBlock,
  CopyButton,
  formatDateTime,
  keyState,
  timeAgo,
} from "@/components/api-access/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { ApiKey, CreatedApiKey } from "@/data/api-access-api";
import {
  useApiKeysQuery,
  useApiScopesQuery,
  useCreateApiKey,
  useDeleteApiKey,
  useRevokeApiKey,
} from "@/data/api-access-store";
import { publicApiBase } from "@/lib/api-docs";

const SCOPE_LABELS: Record<string, { label: string; hint: string }> = {
  employees: { label: "Employees", hint: "Directory records: name, office, department, status." },
  awards: { label: "Awards", hint: "Recognition awards given to employees." },
};

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never expires" },
];

export function CreateKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: scopes = [] } = useApiScopesQuery();
  const createKey = useCreateApiKey();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(["employees"]);
  const [expiry, setExpiry] = useState("90");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Reset after the close animation so the form doesn't flash back.
      setTimeout(() => {
        setName("");
        setSelected(["employees"]);
        setExpiry("90");
        setCreated(null);
      }, 200);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const key = await createKey.mutateAsync({
        name: name.trim(),
        scopes: selected,
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      setCreated(key);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the key.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new key</DialogTitle>
              <DialogDescription>
                This is the only time the full key is shown. Store it somewhere safe; if it is lost,
                create a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <CodeBlock code={created.key} />
              <p className="text-xs text-muted-foreground">
                Send it as <span className="font-mono">Authorization: Bearer {"<key>"}</span> to{" "}
                <span className="font-mono">{publicApiBase()}</span>.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>I've saved it</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                One key per app keeps activity and revocation clear. Keys are read-only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Payroll sync"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Can read</Label>
              <div className="space-y-2">
                {scopes.map((scope) => {
                  const meta = SCOPE_LABELS[scope] ?? { label: scope, hint: "" };
                  const checked = selected.includes(scope);
                  return (
                    <label
                      key={scope}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setSelected((current) =>
                            value === true
                              ? [...current, scope]
                              : current.filter((item) => item !== scope),
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block text-sm font-medium">{meta.label}</span>
                        <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-expiry">Expires</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="api-key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || selected.length === 0 || createKey.isPending}
              >
                {createKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StateBadge({ apiKey }: { apiKey: ApiKey }) {
  const state = keyState(apiKey);
  if (state === "active") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
      {state === "revoked" ? "Revoked" : "Expired"}
    </Badge>
  );
}

export function KeysTab({ onCreate }: { onCreate: () => void }) {
  const { data: keys = [], isLoading, isError } = useApiKeysQuery();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync(revokeTarget.id);
      toast.success(`Revoked "${revokeTarget.name}". It stops working immediately.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke the key.");
    } finally {
      setRevokeTarget(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteKey.mutateAsync(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}".`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the key.");
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <p className="flex items-center gap-2 p-6 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4" /> Couldn't load API keys.
            </p>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <KeyRound className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="font-medium">No API keys yet</p>
                <p className="text-sm text-muted-foreground">
                  Create one to let another internal app read employee data.
                </p>
              </div>
              <Button onClick={onCreate}>
                <Plus className="mr-2 h-4 w-4" /> Create API key
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Can read</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((apiKey) => {
                    const state = keyState(apiKey);
                    return (
                      <TableRow
                        key={apiKey.id}
                        className={state === "active" ? undefined : "opacity-70"}
                      >
                        <TableCell>
                          <p className="font-medium">{apiKey.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Created {formatDateTime(apiKey.createdAt)} by {apiKey.createdByLabel}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{apiKey.keyPrefix}…</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {apiKey.scopes.map((scope) => (
                              <Badge key={scope} variant="secondary">
                                {SCOPE_LABELS[scope]?.label ?? scope}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {timeAgo(apiKey.lastUsedAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {apiKey.expiresAt ? formatDateTime(apiKey.expiresAt) : "Never"}
                        </TableCell>
                        <TableCell>
                          <StateBadge apiKey={apiKey} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!apiKey.revokedAt && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRevokeTarget(apiKey)}
                              >
                                <Ban className="mr-1.5 h-4 w-4" /> Revoke
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete ${apiKey.name}`}
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(apiKey)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Any app using this key loses access immediately. This can't be undone, but you can
              create a new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The key stops working and is removed from this list. Its past requests stay in
              Activity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
