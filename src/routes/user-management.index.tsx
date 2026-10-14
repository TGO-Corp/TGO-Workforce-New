import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Lock,
  Mail,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ActiveSessionsPanel } from "@/components/active-sessions-panel";
import { AddUserDialog } from "@/components/add-user-dialog";
import { PageHeader } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { PermissionMatrixEditor } from "@/components/permission-matrix";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserHoverCard } from "@/components/user-hover-card";
import {
  useAccountsQuery,
  usePendingInvitesQuery,
  useRevokePendingInvite,
  useUpdateAccount,
  useDeleteAccount,
} from "@/data/account-store";
import type { Account } from "@/data/account-api";
import { useAppSettingsQuery, useUpdateAppSettings } from "@/data/app-settings-store";
import { useCurrentAccount, type AccountRole } from "@/lib/session";
import { assignableRoleOptions, ROLE_LABELS } from "@/lib/roles";
import { getEffectiveRole, isFullAccessRole } from "@/lib/permissions";

export const Route = createFileRoute("/user-management/")({
  head: () => ({
    meta: [
      { title: "User Management — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Manage sign-in roles and access for the Torero Global Outsourcing HR Operations portal.",
      },
      {
        property: "og:title",
        content: "User Management — Torero Global Outsourcing HR Operations",
      },
      {
        property: "og:description",
        content: "Admin-only: promote, demote or deactivate portal accounts.",
      },
    ],
  }),
  component: UserManagementPage,
});

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

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function UserManagementPage() {
  const { data: currentAccount, isLoading: currentLoading } = useCurrentAccount();
  const effectiveRole = getEffectiveRole(currentAccount);
  const isAdmin = isFullAccessRole(effectiveRole);
  const isSuperAdmin = effectiveRole === "super_admin";

  const accountsQuery = useAccountsQuery(isAdmin);
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  // The account the "Remove account" confirmation dialog is open for.
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null);
  const invitesQuery = usePendingInvitesQuery(isAdmin);
  const revokeInvite = useRevokePendingInvite();
  const appSettingsQuery = useAppSettingsQuery(isSuperAdmin);
  const updateAppSettings = useUpdateAppSettings();

  if (currentLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Management" description="Manage roles and access." />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="User Management" description="Manage roles and access." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Admins only</p>
              <p className="text-sm text-muted-foreground">
                Your account ({currentAccount ? ROLE_LABELS[currentAccount.role] : "signed out"})
                doesn't have access to this page. Ask an existing admin to promote you if you need
                it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const accounts = accountsQuery.data ?? [];
  const admins = accounts.filter((a) => isFullAccessRole(a.role)).length;
  const active = accounts.filter((a) => a.isActive).length;
  const invites = invitesQuery.data ?? [];

  async function handleRoleChange(accountId: string, role: AccountRole) {
    try {
      await updateAccount.mutateAsync({ id: accountId, patch: { role } });
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update role");
    }
  }

  async function handleActiveToggle(accountId: string, isActive: boolean) {
    try {
      await updateAccount.mutateAsync({ id: accountId, patch: { isActive } });
      toast.success(isActive ? "Account reactivated" : "Account deactivated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update account");
    }
  }

  async function handleRevokeInvite(inviteId: string, email: string) {
    try {
      await revokeInvite.mutateAsync(inviteId);
      toast.success(`Revoked invite for ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't revoke invite");
    }
  }

  async function confirmRemoveAccount() {
    if (!removeTarget) return;
    const label = removeTarget.displayName || removeTarget.email;
    try {
      await deleteAccount.mutateAsync(removeTarget.id);
      toast.success(`Removed ${label}`);
      setRemoveTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that account.");
    }
  }

  async function handleRestrictToggle(accountId: string, isRestricted: boolean) {
    try {
      await updateAccount.mutateAsync({ id: accountId, patch: { isRestricted } });
      toast.success(isRestricted ? "Account restricted to view-only" : "Restriction lifted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update account");
    }
  }

  async function handleInviteOnlyToggle(inviteOnlySignup: boolean) {
    try {
      await updateAppSettings.mutateAsync({ inviteOnlySignup });
      toast.success(
        inviteOnlySignup
          ? "Sign-in is now invite-only"
          : "Anyone with a Zoho account can sign in again",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update sign-in access");
    }
  }

  async function handleOutlookToggle(useOutlookForViolations: boolean) {
    try {
      await updateAppSettings.mutateAsync({ useOutlookForViolations });
      toast.success(
        useOutlookForViolations
          ? "Attendance Violations now sends via MS Outlook"
          : "Attendance Violations is back to sending via Zoho Mail",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update email delivery");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Everyone who has signed in via Zoho, and what they can do here."
        action={<AddUserDialog />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Total Accounts"
          value={accounts.length}
          hint="Ever signed in"
          icon={Users}
        />
        <MetricCard title="Admins" value={admins} hint="Full access" icon={ShieldCheck} />
        <MetricCard title="Active" value={active} hint="Not deactivated" icon={UserCheck} />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="active-sessions">Active Sessions</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="permissions">Permissions</TabsTrigger>}
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>
                Change a role or deactivate access below — changes apply immediately and are logged
                to Activity Logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Account</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isSuperAdmin && <TableHead>Restrict</TableHead>}
                    <TableHead>Last sign-in</TableHead>
                    <TableHead className="text-right">Joined</TableHead>
                    <TableHead className="w-14 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountsQuery.isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={isSuperAdmin ? 7 : 6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Loading accounts...
                      </TableCell>
                    </TableRow>
                  ) : accountsQuery.isError ? (
                    <TableRow>
                      <TableCell
                        colSpan={isSuperAdmin ? 7 : 6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Couldn't load accounts. Try refreshing the page.
                      </TableCell>
                    </TableRow>
                  ) : accounts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={isSuperAdmin ? 7 : 6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No one has signed in yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((account) => {
                      const isSelf = account.id === currentAccount?.id;
                      const displayName =
                        account.displayName ||
                        [account.firstName, account.lastName].filter(Boolean).join(" ") ||
                        account.email;

                      return (
                        <TableRow key={account.id}>
                          <TableCell className="py-3 pl-4">
                            <UserHoverCard account={account}>
                              <Link
                                to="/user-management/$accountId"
                                params={{ accountId: account.id }}
                                className="-m-1.5 flex items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60"
                              >
                                <Avatar className="size-9">
                                  {account.photoUrl && (
                                    <AvatarImage src={account.photoUrl} alt={displayName} />
                                  )}
                                  <AvatarFallback className="text-xs">
                                    {initials(displayName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {displayName}{" "}
                                    {isSelf && <span className="text-muted-foreground">(you)</span>}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {account.email}
                                  </p>
                                </div>
                              </Link>
                            </UserHoverCard>
                          </TableCell>
                          <TableCell className="py-3">
                            <Select
                              value={account.role}
                              disabled={isSelf || updateAccount.isPending}
                              onValueChange={(value) =>
                                handleRoleChange(account.id, value as AccountRole)
                              }
                            >
                              <SelectTrigger className="w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {assignableRoleOptions(currentAccount?.role).map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2.5">
                              <Switch
                                checked={account.isActive}
                                disabled={isSelf || updateAccount.isPending}
                                onCheckedChange={(checked) =>
                                  handleActiveToggle(account.id, checked)
                                }
                              />
                              <Badge variant={account.isActive ? "default" : "secondary"}>
                                {account.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={account.isRestricted}
                                  disabled={isSelf || updateAccount.isPending}
                                  onCheckedChange={(checked) =>
                                    handleRestrictToggle(account.id, checked)
                                  }
                                />
                                {account.isRestricted && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 text-amber-600 dark:text-amber-400"
                                  >
                                    <Lock className="h-3 w-3" /> View-only
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {formatDateTime(account.lastLoginAt)}
                          </TableCell>
                          <TableCell className="py-3 text-right text-sm text-muted-foreground">
                            {formatDateTime(account.createdAt)}
                          </TableCell>
                          <TableCell className="py-3 pr-4 text-right">
                            {/* Not yourself, and only a Super Admin can remove an Admin or
                                Super Admin — the same rules the server enforces. */}
                            {!isSelf && (isSuperAdmin || !isFullAccessRole(account.role)) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                title="Remove account"
                                aria-label={`Remove ${displayName}`}
                                onClick={() => setRemoveTarget(account)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending Invites</CardTitle>
              <CardDescription>
                Emails an admin pre-assigned a role to before they've signed in. The role applies
                automatically on their first Zoho sign-in — this doesn't send them anything, so let
                them know to go sign in.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited by</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitesQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        Loading invites...
                      </TableCell>
                    </TableRow>
                  ) : invitesQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        Couldn't load pending invites. Try refreshing the page.
                      </TableCell>
                    </TableRow>
                  ) : invites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-1">
                          <Mail className="h-5 w-5 text-muted-foreground/60" />
                          No pending invites. Use "Add User" above to pre-assign a role before
                          someone's first sign-in.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invites.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell className="font-medium">{invite.email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ROLE_LABELS[invite.role]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {invite.invitedByLabel}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(invite.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={revokeInvite.isPending}
                            onClick={() => handleRevokeInvite(invite.id, invite.email)}
                            aria-label={`Revoke invite for ${invite.email}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Sign-in Access
                </CardTitle>
                <CardDescription>
                  Control who can create a brand-new account by signing in with Zoho for the first
                  time. Doesn't affect anyone who has already signed in.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">Require an invite to sign in</p>
                    <p className="text-sm text-muted-foreground">
                      When on, only emails pre-assigned a role via "Add User" above (or the standing
                      admin allowlist) can create a new account. Existing accounts sign in as
                      always.
                    </p>
                  </div>
                  <Switch
                    checked={appSettingsQuery.data?.inviteOnlySignup ?? false}
                    disabled={appSettingsQuery.isLoading || updateAppSettings.isPending}
                    onCheckedChange={handleInviteOnlyToggle}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  Attendance Email Delivery
                </CardTitle>
                <CardDescription>
                  Attendance Violations normally sends employee notice emails through the Zoho Mail
                  API. Turn this on while that isn't set up yet — approvers send from their own mail
                  app instead (whichever one is set up on their computer or browser — Outlook, Zoho
                  Mail, or anything else that can register for mailto: links).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Use your own mail app instead of Zoho Mail
                    </p>
                    <p className="text-sm text-muted-foreground">
                      When on, "Send now" and bulk send open the email in whatever's registered as
                      the approver's default mail app (via mailto:) and mark the record Sent right
                      away — the app can't confirm whether it was actually sent from there, so this
                      is a "mark as sent," not a delivery guarantee. From/Cc become editable at send
                      time either way.
                    </p>
                  </div>
                  <Switch
                    checked={appSettingsQuery.data?.useOutlookForViolations ?? false}
                    disabled={appSettingsQuery.isLoading || updateAppSettings.isPending}
                    onCheckedChange={handleOutlookToggle}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Only have Outlook set up, but someone actually uses Zoho Mail? Zoho Mail can
                  register itself as the browser's default mailto: handler too — in Zoho Mail, go to{" "}
                  <span className="font-medium">Settings → System → Mail To Handlers</span> and turn
                  on "Enable Mail To Handler," then allow it when the browser asks. After that,
                  "Send now" opens Zoho Mail's own compose window instead of Outlook — no app update
                  needed.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="active-sessions">
          <ActiveSessionsPanel />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="permissions">
            <PermissionMatrixEditor />
          </TabsContent>
        )}
      </Tabs>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !deleteAccount.isPending) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget?.displayName || removeTarget?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This deletes <strong>{removeTarget?.email}</strong>'s Workforce account and signs
                  out any browser they have open. Their past activity stays in the logs under their
                  name.
                </p>
                {removeTarget && isFullAccessRole(removeTarget.role) && (
                  <p className="font-medium text-destructive">
                    This account has {ROLE_LABELS[removeTarget.role]} access.
                  </p>
                )}
                <p>
                  This does not remove them from the TGO Gateway: if they still have access there,
                  they can sign in again and would start over as a new Viewer. To keep someone out
                  for good, deactivate the account or remove their Gateway access instead.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAccount.isPending}
              onClick={(event) => {
                // Keep the dialog open until the request finishes.
                event.preventDefault();
                void confirmRemoveAccount();
              }}
            >
              {deleteAccount.isPending ? "Removing..." : "Remove account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
