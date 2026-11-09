"""Reads and writes the permission matrix — see app/models/permission.py for
what this does and doesn't govern.
"""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account, AccountRole
from app.models.activity_log import ActivityCategory
from app.models.permission import Permission, RolePermission

# Bypass the matrix entirely — always every permission, matrix rows or not.
FULL_ACCESS_ROLES = {AccountRole.ADMIN, AccountRole.SUPER_ADMIN}

# The few permissions Admin and Super Admin do NOT get automatically: they are
# ordinary matrix rows for those two roles too, so a Super Admin can switch them
# off even for the full-access roles (today: whether ages are shown). Everything
# else stays an unconditional "always".
FULL_ACCESS_OPTIONAL: frozenset[Permission] = frozenset({Permission.AGE_VIEW})

# Every "view" permission — what a restricted account (Account.is_restricted)
# keeps regardless of role; every "manage"/"approve" permission is stripped.
VIEW_PERMISSIONS: frozenset[Permission] = frozenset(
    {
        Permission.EMPLOYEES_VIEW,
        Permission.MILESTONES_VIEW,
        Permission.ONBOARDING_VIEW,
        Permission.ATTENDANCE_VIEW,
        Permission.AWARDS_VIEW,
        Permission.BENEFITS_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
        Permission.NEW_HIRES_VIEW,
        Permission.PORTAL_ACTIVITY_VIEW,
        Permission.AGE_VIEW,
    }
)

# Which permission governs seeing each Activity Log category — None means
# "admin/super_admin only, not matrix-configurable" (Access/Data/System are
# security- and infrastructure-level, not a specific module a non-admin role
# owns). See visible_activity_categories below.
CATEGORY_PERMISSION: dict[ActivityCategory, Permission | None] = {
    ActivityCategory.EMPLOYEE: Permission.EMPLOYEES_VIEW,
    ActivityCategory.ONBOARDING: Permission.ONBOARDING_VIEW,
    ActivityCategory.ATTENDANCE: Permission.ATTENDANCE_VIEW,
    ActivityCategory.BENEFITS: Permission.BENEFITS_VIEW,
    ActivityCategory.ACCESS: None,
    ActivityCategory.DATA: None,
    ActivityCategory.SYSTEM: None,
}

# The six roles a Super Admin actually configures. Admin/Super Admin are
# deliberately excluded — they're never anything but full-access, so a row
# for them in the matrix would just be confusing dead UI.
MATRIX_ROLES: list[AccountRole] = [
    AccountRole.PEOPLE_OPS,
    AccountRole.HR,
    AccountRole.PROJECTS,
    AccountRole.RECRUITMENT_LEAD,
    AccountRole.ONBOARDING_SPECIALIST,
    AccountRole.VIEWER,
]

PERMISSION_LABELS: dict[Permission, dict[str, str]] = {
    Permission.EMPLOYEES_VIEW: {
        "title": "View Employees",
        "description": "See the Employee Directory.",
    },
    Permission.EMPLOYEES_MANAGE: {
        "title": "Manage Employees",
        "description": "Create, edit, delete and import employee records.",
    },
    Permission.MILESTONES_VIEW: {
        "title": "View Milestones",
        "description": "See the Anniversaries and Birthdays pages.",
    },
    Permission.ONBOARDING_VIEW: {
        "title": "View Onboarding Tracker",
        "description": "See the onboarding checklist tracker (distinct from the Onboarding New "
        "Hires page, which has its own View Onboarding New Hires permission).",
    },
    Permission.ONBOARDING_MANAGE: {
        "title": "Manage Onboarding Tracker",
        "description": "Add, edit and delete new-hire checklist rows (still subject to the SOP's "
        "Recruitment Lead / Onboarding Specialist checklist-field split).",
    },
    Permission.ATTENDANCE_VIEW: {
        "title": "View Attendance Violations",
        "description": "See the attendance violation tracker.",
    },
    Permission.ATTENDANCE_MANAGE: {
        "title": "Manage Attendance Violations",
        "description": "Create, edit, prepare and import violation records.",
    },
    Permission.ATTENDANCE_APPROVE: {
        "title": "Approve Attendance Violations",
        "description": "Approve, hold, and send violation emails.",
    },
    Permission.AWARDS_VIEW: {
        "title": "View Recognition & Awards",
        "description": "See the awards given to employees.",
    },
    Permission.AWARDS_MANAGE: {
        "title": "Manage Recognition & Awards",
        "description": "Give a new award to an active employee, and edit or delete existing awards.",
    },
    Permission.BENEFITS_VIEW: {
        "title": "View Employee Benefits",
        "description": "See the Employee Benefits pages (currently just HMO Management).",
    },
    Permission.BENEFITS_MANAGE: {
        "title": "Manage Employee Benefits",
        "description": "Add, edit and delete benefits records — placeholder, not yet built.",
    },
    Permission.ACTIVITY_LOGS_VIEW: {
        "title": "View Activity Logs",
        "description": "See the Activity Logs page (still limited to the categories the role's "
        "other permissions cover).",
    },
    Permission.NEW_HIRES_VIEW: {
        "title": "View Onboarding New Hires",
        "description": "See the Onboarding New Hires page (the external onboarding portal feed).",
    },
    Permission.PORTAL_ACTIVITY_VIEW: {
        "title": "View Onboarding & Offboarding Activity",
        "description": "See live Onboarding & Offboarding Portal activity (exit requests, final pay, "
        "asset returns, exit interviews) on the Dashboard and receive its notifications.",
    },
    Permission.AGE_VIEW: {
        "title": "View Employee Age",
        "description": "See employees' ages on their profile and on the Birthdays page.",
    },
}

# Default grants — matches this app's behavior from *before* the matrix
# existed, so turning the matrix on doesn't silently change anyone's access
# until a Super Admin actually edits it. The migration that creates
# role_permissions seeds exactly this (a later migration adds
# MILESTONES_VIEW to every one of these, matching Milestones' own
# previously-ungated "open to every signed-in role" behavior).
DEFAULT_GRANTS: dict[AccountRole, set[Permission]] = {
    AccountRole.PEOPLE_OPS: {
        Permission.AGE_VIEW,
        Permission.EMPLOYEES_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
        Permission.NEW_HIRES_VIEW,
        Permission.EMPLOYEES_MANAGE,
        Permission.MILESTONES_VIEW,
        Permission.AWARDS_VIEW,
        Permission.AWARDS_MANAGE,
        Permission.PORTAL_ACTIVITY_VIEW,
    },
    AccountRole.HR: {
        Permission.AGE_VIEW,
        Permission.EMPLOYEES_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
        Permission.NEW_HIRES_VIEW,
        Permission.MILESTONES_VIEW,
        Permission.ATTENDANCE_VIEW,
        Permission.ATTENDANCE_MANAGE,
        Permission.ATTENDANCE_APPROVE,
        # Per the HMO Management SOP's stated primary users ("HR / Admin and
        # authorized project stakeholders") — HR runs the module day to day.
        Permission.BENEFITS_VIEW,
        Permission.BENEFITS_MANAGE,
        Permission.PORTAL_ACTIVITY_VIEW,
    },
    AccountRole.PROJECTS: {
        Permission.AGE_VIEW,
        Permission.EMPLOYEES_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
        Permission.NEW_HIRES_VIEW,
        Permission.MILESTONES_VIEW,
        Permission.ATTENDANCE_VIEW,
        Permission.ATTENDANCE_MANAGE,
        # View-only: Projects are the SOP's "authorized stakeholders" —
        # monitoring the rollout, not the ones doing day-to-day HMO data entry.
        Permission.BENEFITS_VIEW,
    },
    AccountRole.RECRUITMENT_LEAD: {
        Permission.AGE_VIEW,
        Permission.EMPLOYEES_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
        Permission.NEW_HIRES_VIEW,
        Permission.MILESTONES_VIEW,
        Permission.ONBOARDING_VIEW,
        Permission.ONBOARDING_MANAGE,
    },
    AccountRole.ONBOARDING_SPECIALIST: {
        Permission.AGE_VIEW,
        Permission.EMPLOYEES_VIEW,
        Permission.ACTIVITY_LOGS_VIEW,
        Permission.NEW_HIRES_VIEW,
        Permission.MILESTONES_VIEW,
        Permission.ONBOARDING_VIEW,
        Permission.ONBOARDING_MANAGE,
    },
    AccountRole.VIEWER: {
        Permission.AGE_VIEW,
        Permission.EMPLOYEES_VIEW,
        Permission.MILESTONES_VIEW,
    },
}


async def get_account_permissions(db: AsyncSession, account: Account, *, role: AccountRole) -> set[Permission]:
    """Every permission this account currently has, computed against `role` —
    always pass the *effective* role for this request (see
    app/core/auth.py's get_effective_role), which is account.role unless a
    Super Admin has an active sandbox override. Used both by has_permission()
    below and to populate AccountRead.permissions for the frontend's own
    nav/page gating.

    A restricted account (account.is_restricted) is capped to view-only here
    regardless of what `role` would otherwise grant — including a Super
    Admin's own FULL_ACCESS_ROLES bypass, so restriction really does mean
    "view only everywhere."""
    if role in FULL_ACCESS_ROLES:
        # Everything, except the optional ones, which follow the matrix row for
        # this role like any other role's permission does.
        result = await db.execute(select(RolePermission.permission).where(RolePermission.role == role))
        granted = (set(Permission) - FULL_ACCESS_OPTIONAL) | (set(result.scalars().all()) & FULL_ACCESS_OPTIONAL)
    else:
        result = await db.execute(select(RolePermission.permission).where(RolePermission.role == role))
        granted = set(result.scalars().all())
    if account.is_restricted:
        granted &= VIEW_PERMISSIONS
    return granted


async def has_permission(db: AsyncSession, account: Account, permission: Permission, *, role: AccountRole) -> bool:
    return permission in await get_account_permissions(db, account, role=role)


async def visible_activity_categories(
    db: AsyncSession, account: Account, *, role: AccountRole
) -> set[ActivityCategory]:
    """Which Activity Log categories this account may currently see — mirrors
    the module-siloed rule everywhere else in the app: Admin/Super Admin
    (unrestricted) see every category, including the admin-only Access/Data/
    System ones; every other account (and any restricted account, full-
    access or not) only sees the categories whose CATEGORY_PERMISSION they
    currently hold."""
    permissions = await get_account_permissions(db, account, role=role)
    if role in FULL_ACCESS_ROLES and not account.is_restricted:
        return set(ActivityCategory)
    return {
        category
        for category, required in CATEGORY_PERMISSION.items()
        if required is not None and required in permissions
    }


async def get_full_matrix(db: AsyncSession) -> dict[AccountRole, set[Permission]]:
    # Admin and Super Admin appear too, but only for FULL_ACCESS_OPTIONAL rows.
    editable = MATRIX_ROLES + sorted(FULL_ACCESS_ROLES, key=lambda r: r.value)
    result = await db.execute(select(RolePermission).where(RolePermission.role.in_(editable)))
    matrix: dict[AccountRole, set[Permission]] = {role: set() for role in editable}
    for row in result.scalars().all():
        if row.role in FULL_ACCESS_ROLES and row.permission not in FULL_ACCESS_OPTIONAL:
            continue
        matrix[row.role].add(row.permission)
    return matrix


async def replace_matrix(db: AsyncSession, matrix: dict[AccountRole, set[Permission]]) -> None:
    """Wholesale replace: deletes every existing grant for the roles present
    in `matrix` and re-inserts exactly what's given. The Save button sends
    the entire editable matrix at once, so this is one atomic operation
    rather than N per-cell races. Silently ignores any role outside
    MATRIX_ROLES (e.g. if a caller accidentally includes admin/super_admin)
    rather than erroring — those roles just have nothing to store."""
    roles = [role for role in matrix if role in MATRIX_ROLES or role in FULL_ACCESS_ROLES]
    if not roles:
        return
    await db.execute(delete(RolePermission).where(RolePermission.role.in_(roles)))
    for role in roles:
        for permission in matrix[role]:
            if role in FULL_ACCESS_ROLES and permission not in FULL_ACCESS_OPTIONAL:
                continue  # they always have these; nothing to store
            db.add(RolePermission(role=role, permission=permission))
    await db.flush()
