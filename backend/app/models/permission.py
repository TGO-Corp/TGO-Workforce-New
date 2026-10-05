"""The permission matrix — a fixed, code-defined catalog of capabilities
(Permission below) and a database-backed grant table (RolePermission) saying
which of the six configurable roles currently holds each one. Admin and
Super Admin are NOT in this table at all — they bypass it entirely and
always have every permission (see app/services/permissions.py's
FULL_ACCESS_ROLES) — only Super Admin can edit the grants themselves.

This governs MODULE-LEVEL access only: can People Ops see Employee Directory
at all, can HR approve a violation email, etc. It does NOT replace the
SOP-mandated field-level splits within a module (Recruitment Lead vs
Onboarding Specialist on the onboarding checklist; HR-approves-only within
Attendance) — those stay fixed in code (see ROLE_FIELD_ACCESS in
app/api/routes/new_hires.py), since they come from an actual written
procedure, not something meant to be casually reconfigured.
"""

import enum

from sqlalchemy import Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.account import AccountRole


class Permission(enum.StrEnum):
    EMPLOYEES_VIEW = "employees.view"
    EMPLOYEES_MANAGE = "employees.manage"
    # Anniversaries + Birthdays — both are read-only lenses over Employee
    # Directory data (see src/routes/anniversaries.tsx and birthdays.tsx),
    # not their own backend module, so there's no matching *_MANAGE: nothing
    # is ever created/edited/deleted there. Gated separately from
    # EMPLOYEES_VIEW so a Super Admin can hide Milestones for a role without
    # hiding the whole Employee Directory (or vice versa).
    MILESTONES_VIEW = "milestones.view"
    ONBOARDING_VIEW = "onboarding.view"
    ONBOARDING_MANAGE = "onboarding.manage"
    ATTENDANCE_VIEW = "attendance.view"
    ATTENDANCE_MANAGE = "attendance.manage"
    ATTENDANCE_APPROVE = "attendance.approve"
    # Recognition & Awards — under Milestones with Anniversaries/Birthdays,
    # but unlike those two this is a real writable module (give/edit/delete
    # an award), so it gets both a view and a manage permission, same split
    # as Employees/Onboarding above.
    AWARDS_VIEW = "awards.view"
    AWARDS_MANAGE = "awards.manage"
    # Employee Benefits — placeholder module (HMO Management to start; more
    # to follow once scoped). Added now so the nav item and permission-matrix
    # row exist ahead of the actual feature; not granted to any role by
    # default (see services/permissions.py's DEFAULT_GRANTS comment — new
    # permissions simply start ungranted, a Super Admin turns them on once
    # there's something real behind them).
    BENEFITS_VIEW = "benefits.view"
    BENEFITS_MANAGE = "benefits.manage"
    # Activity Logs and Onboarding New Hires used to have no permission of
    # their own (Activity Logs was open to every signed-in account, New Hires
    # rode on EMPLOYEES_VIEW) — split out so a Super Admin can hide them from
    # a role (the Viewer role, by default) without touching anything else.
    # Standing rule: every new module/page gets its own Permission value(s)
    # here, a label in PERMISSION_LABELS (backend + frontend), a migration
    # and a require_permission gate — nothing ships outside the matrix.
    ACTIVITY_LOGS_VIEW = "activity_logs.view"
    NEW_HIRES_VIEW = "new_hires.view"


class RolePermission(Base):
    """One row = one role holds one permission. No row = doesn't. There's no
    boolean "granted" column on purpose — existence *is* the grant, which
    makes a full-matrix save (app/services/permissions.py's replace_matrix)
    a plain delete-then-insert instead of having to diff against a previous
    true/false state."""

    __tablename__ = "role_permissions"

    # Re-uses the existing "account_role" Postgres enum type (already created
    # for accounts.role) rather than defining a new one — see the migration
    # that creates this table for the create_type=False detail that makes
    # that work.
    role: Mapped[AccountRole] = mapped_column(
        Enum(AccountRole, name="account_role", values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        primary_key=True,
    )
    permission: Mapped[Permission] = mapped_column(
        Enum(Permission, name="permission", values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        primary_key=True,
    )
