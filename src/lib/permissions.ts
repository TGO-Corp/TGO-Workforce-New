// Module-level access ("can this role touch Employees/Onboarding/Attendance
// at all") is governed by the configurable permission matrix a Super Admin
// edits on the User Management page — see backend/app/services/permissions.py
// and PermissionMatrixEditor (@/components/permission-matrix.tsx). It is NOT
// a hardcoded role list on the frontend anymore: every check below reads the
// signed-in account's own `permissions` array (populated by GET /auth/me),
// so a matrix edit takes effect immediately without a frontend redeploy.
// Hiding a button/nav item/page here is a UX nicety, not the real access
// control — the backend enforces the same permission on every route
// regardless of what the UI shows (see app/core/auth.py's require_permission).
//
// Two things stay OUT of the matrix, fixed in code on both ends:
//   - Admin and Super Admin bypass the matrix entirely — always full access
//     everywhere except editing the matrix itself, which is Super Admin only.
//     See FULL_ACCESS_ROLES/isFullAccessRole below.
//   - The SOP-mandated *field-level* splits inside Onboarding (Recruitment
//     Lead vs Onboarding Specialist's checklist columns) and Attendance
//     (Projects prepares, only HR approves/sends) — these come from written
//     SOPs, not a configurable preference, so they stay role-based via
//     canEditOnboardingField below and the backend's ROLE_FIELD_ACCESS /
//     require_violation_approver.

import type { AccountProfile, AccountRole, Permission } from "@/lib/session";

// Mirrors FULL_ACCESS_ROLES in backend/app/services/permissions.py.
export const FULL_ACCESS_ROLES: ReadonlySet<AccountRole> = new Set(["admin", "super_admin"]);

export function isFullAccessRole(role: AccountRole | undefined): boolean {
  return !!role && FULL_ACCESS_ROLES.has(role);
}

// Mirrors PERMISSION_LABELS in backend/app/services/permissions.py — kept as
// a frontend copy rather than fetched, since the only endpoint that returns
// these (GET /permissions/matrix) is Super-Admin-only and the Profile page's
// "My Permissions" section has to work for every role, reading nothing but
// the already-fetched account.permissions from GET /auth/me.
export const PERMISSION_LABELS: Record<Permission, { title: string; description: string }> = {
  "employees.view": {
    title: "View Employees",
    description: "See the Employee Directory.",
  },
  "employees.manage": {
    title: "Manage Employees",
    description: "Create, edit, delete and import employee records.",
  },
  "milestones.view": {
    title: "View Milestones",
    description: "See the Anniversaries and Birthdays pages.",
  },
  "onboarding.view": {
    title: "View Onboarding Tracker",
    description:
      "See the onboarding checklist tracker (distinct from the Onboarding New Hires page, which has its own View Onboarding New Hires permission).",
  },
  "onboarding.manage": {
    title: "Manage Onboarding Tracker",
    description: "Add, edit and delete new-hire checklist rows.",
  },
  "attendance.view": {
    title: "View Attendance Violations",
    description: "See the attendance violation tracker.",
  },
  "attendance.manage": {
    title: "Manage Attendance Violations",
    description: "Create, edit, prepare and import violation records.",
  },
  "attendance.approve": {
    title: "Approve Attendance Violations",
    description: "Approve, hold, and send violation emails.",
  },
  "awards.view": {
    title: "View Recognition & Awards",
    description: "See the awards given to employees.",
  },
  "awards.manage": {
    title: "Manage Recognition & Awards",
    description: "Give a new award, and edit or delete existing awards.",
  },
  "benefits.view": {
    title: "View Employee Benefits",
    description: "See the Employee Benefits pages (currently just HMO Management).",
  },
  "benefits.manage": {
    title: "Manage Employee Benefits",
    description:
      "Add, edit and delete benefits records — placeholder until the module is built out.",
  },
  "activity_logs.view": {
    title: "View Activity Logs",
    description:
      "See the Activity Logs page (still limited to the categories the role's other permissions cover).",
  },
  "new_hires.view": {
    title: "View Onboarding New Hires",
    description: "See the Onboarding New Hires page (the external onboarding portal feed).",
  },
};

// Narrower than isFullAccessRole above — a few things (editing the
// permission matrix, triaging the Feedback board's status/priority/reporter
// identity) are Super Admin-only, deliberately excluding a plain Admin. Feed
// this getEffectiveRole(account)'s result, same as isFullAccessRole.
export function isSuperAdminRole(role: AccountRole | undefined): boolean {
  return role === "super_admin";
}

// Mirrors backend/app/core/auth.py's get_effective_role: the role every
// admin/super-admin gate and nav/page permission check should actually use —
// the real persisted role, unless a Super Admin has an active sandbox
// override (see useEnterSandbox/useExitSandbox in @/lib/session). Use this
// instead of reading account.role directly anywhere access is being decided;
// `role` itself stays meaningful only for "who am I really" contexts like the
// Profile page badge and the sandbox control's own visibility.
export function getEffectiveRole(
  account: Pick<AccountProfile, "role" | "sandbox_role"> | null | undefined,
): AccountRole | undefined {
  return account?.sandbox_role ?? account?.role;
}

export function hasPermission(
  permissions: Permission[] | undefined,
  permission: Permission,
): boolean {
  return !!permissions?.includes(permission);
}

export function canViewEmployees(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "employees.view");
}

export function canManageEmployees(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "employees.manage");
}

// Anniversaries + Birthdays — see Permission.MILESTONES_VIEW's own comment
// in backend/app/models/permission.py. Both pages also read from the
// Employee Directory data itself (GET /employees), so a role realistically
// needs employees.view too for the pages to show anything; nav gating in
// @/components/app-sidebar checks both, not just this one.
export function canViewMilestones(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "milestones.view");
}

export function canViewOnboarding(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "onboarding.view");
}

export function canManageOnboarding(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "onboarding.manage");
}

export function canViewAttendance(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "attendance.view");
}

export function canManageAttendance(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "attendance.manage");
}

export function canApproveAttendance(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "attendance.approve");
}

// Recognition & Awards — same "read this module's data" idea as Milestones
// above, but this module has its own real writes too, so it gets a
// canManage alongside canView (see Permission.AWARDS_MANAGE's own comment
// in backend/app/models/permission.py).
export function canViewAwards(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "awards.view");
}

export function canManageAwards(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "awards.manage");
}

// Employee Benefits — placeholder module (HMO Management to start; more
// pages to follow once scoped). Not granted to any role by default; a Super
// Admin turns it on from User Management's permission matrix.
export function canViewBenefits(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "benefits.view");
}

export function canViewActivityLogs(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "activity_logs.view");
}

export function canViewNewHires(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "new_hires.view");
}

export function canManageBenefits(permissions: Permission[] | undefined): boolean {
  return hasPermission(permissions, "benefits.manage");
}

// Mirrors ROLE_FIELD_ACCESS in backend/app/api/routes/new_hires.py — the New
// Hire Onboarding Tracker SOP's protected-range split: Recruitment Lead owns
// items 1-2, Onboarding Specialist owns items 4-7, item 3 (Welcome Email
// Sent) is shared since it depends on whichever person is available first.
// Fixed by the SOP, not matrix-configurable — see the module comment above.
// Used to disable individual checklist checkboxes per role in
// src/routes/onboarding.tsx — hiding/disabling is a UX nicety here too; the
// backend enforces the same matrix on every PATCH regardless of what the UI
// allows clicking.
const ONBOARDING_FIELD_ACCESS: Record<string, ReadonlySet<AccountRole>> = {
  joDiscussion: new Set(["admin", "super_admin", "recruitment_lead"]),
  confirmationSigned: new Set(["admin", "super_admin", "recruitment_lead"]),
  welcomeEmailSent: new Set(["admin", "super_admin", "recruitment_lead", "onboarding_specialist"]),
  newHireInfo: new Set(["admin", "super_admin", "onboarding_specialist"]),
  idPhoto: new Set(["admin", "super_admin", "onboarding_specialist"]),
  credentialsCreated: new Set(["admin", "super_admin", "onboarding_specialist"]),
  onboardingDay: new Set(["admin", "super_admin", "onboarding_specialist"]),
};

export function canEditOnboardingField(
  role: AccountRole | undefined,
  field: keyof typeof ONBOARDING_FIELD_ACCESS,
): boolean {
  return !!role && (ONBOARDING_FIELD_ACCESS[field]?.has(role) ?? false);
}
