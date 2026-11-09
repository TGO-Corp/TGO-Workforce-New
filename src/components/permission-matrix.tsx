// The permission matrix editor — Super-Admin-only section of the User
// Management page. Roles are columns, permissions are rows; toggling a
// switch only changes local draft state until "Save changes" is pressed,
// which sends the whole matrix to PUT /permissions/matrix in one call (see
// @/data/permission-store). Admin and Super Admin bypass the matrix (see
// FULL_ACCESS_ROLES in backend/app/services/permissions.py) EXCEPT for the few
// optional permissions (FULL_ACCESS_OPTIONAL_PERMISSIONS, e.g. showing ages):
// they get columns here too, but only those rows are switches; every other
// cell reads "Always".

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissionMatrixQuery, useUpdatePermissionMatrix } from "@/data/permission-store";
import { FULL_ACCESS_OPTIONAL_PERMISSIONS, isFullAccessRole } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";
import type { AccountRole, Permission } from "@/lib/session";

type Grants = Partial<Record<AccountRole, Permission[]>>;

function permissionsOf(grants: Grants, role: AccountRole): Set<Permission> {
  return new Set(grants[role] ?? []);
}

function sortedGrants(grants: Grants, roles: AccountRole[]) {
  return roles.map((role) => [role, [...(grants[role] ?? [])].sort()] as const);
}

export function PermissionMatrixEditor() {
  const { data: matrix, isLoading, isError } = usePermissionMatrixQuery(true);
  const updateMatrix = useUpdatePermissionMatrix();
  const [draft, setDraft] = useState<Grants | null>(null);

  useEffect(() => {
    if (!matrix) return;
    setDraft(Object.fromEntries(matrix.roles.map((r) => [r.role, r.permissions])));
  }, [matrix]);

  if (isLoading || !matrix || !draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Permission Matrix
          </CardTitle>
          <CardDescription>
            {isError ? "Couldn't load the permission matrix. Try refreshing the page." : "Loading…"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const roles = matrix.roles.map((r) => r.role);
  const dirty =
    JSON.stringify(sortedGrants(draft, roles)) !==
    JSON.stringify(
      sortedGrants(Object.fromEntries(matrix.roles.map((r) => [r.role, r.permissions])), roles),
    );

  function toggle(role: AccountRole, permission: Permission) {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = permissionsOf(prev, role);
      if (current.has(permission)) current.delete(permission);
      else current.add(permission);
      return { ...prev, [role]: Array.from(current) };
    });
  }

  async function handleSave() {
    if (!draft) return;
    try {
      await updateMatrix.mutateAsync(draft);
      toast.success("Permission matrix updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the permission matrix");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Permission Matrix
        </CardTitle>
        <CardDescription>
          Choose exactly what each role can see and do, module by module. Admin and Super Admin
          always have full access to every module; the only thing you can switch off for them is
          employee age. Only Super Admin can edit this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[240px]">Permission</TableHead>
                {roles.map((role) => (
                  <TableHead key={role} className="text-center">
                    {ROLE_LABELS[role]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.permissions.map((permission) => (
                <TableRow key={permission.key}>
                  <TableCell>
                    <p className="text-sm font-medium">{permission.title}</p>
                    <p className="text-xs text-muted-foreground">{permission.description}</p>
                  </TableCell>
                  {roles.map((role) =>
                    isFullAccessRole(role) &&
                    !FULL_ACCESS_OPTIONAL_PERMISSIONS.includes(permission.key) ? (
                      <TableCell key={role} className="text-center text-xs text-muted-foreground">
                        Always
                      </TableCell>
                    ) : (
                      <TableCell key={role} className="text-center">
                        <Switch
                          checked={permissionsOf(draft, role).has(permission.key)}
                          onCheckedChange={() => toggle(role, permission.key)}
                          aria-label={`${permission.title} — ${ROLE_LABELS[role]}`}
                        />
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button onClick={handleSave} disabled={!dirty || updateMatrix.isPending}>
            {updateMatrix.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
