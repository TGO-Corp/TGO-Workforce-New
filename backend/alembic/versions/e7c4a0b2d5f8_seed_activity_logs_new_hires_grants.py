"""seed activity_logs.view / new_hires.view default grants

Both pages were previously open to every role that could see the Employee
Directory (Activity Logs to any signed-in account), so every matrix role
keeps access EXCEPT Viewer, which is the point of this change. Super Admin
can re-grant either to Viewer from User Management.

Mirrors DEFAULT_GRANTS in app/services/permissions.py.

Revision ID: e7c4a0b2d5f8
Revises: d6b3f9a1c4e7
Create Date: 2026-10-05 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e7c4a0b2d5f8"
down_revision: Union[str, None] = "d6b3f9a1c4e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLES = ["people_ops", "hr", "projects", "recruitment_lead", "onboarding_specialist"]
PERMISSIONS = ["activity_logs.view", "new_hires.view"]


def upgrade() -> None:
    account_role_enum = postgresql.ENUM(
        "super_admin", "admin", "people_ops", "hr", "projects",
        "recruitment_lead", "onboarding_specialist", "viewer",
        name="account_role", create_type=False,
    )
    permission_enum = postgresql.ENUM(
        "employees.view", "employees.manage", "milestones.view",
        "onboarding.view", "onboarding.manage",
        "attendance.view", "attendance.manage", "attendance.approve",
        "awards.view", "awards.manage",
        "benefits.view", "benefits.manage",
        "activity_logs.view", "new_hires.view",
        name="permission", create_type=False,
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("role", account_role_enum),
        sa.column("permission", permission_enum),
    )
    op.bulk_insert(
        role_permissions,
        [{"role": role, "permission": perm} for role in ROLES for perm in PERMISSIONS],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE permission IN ('activity_logs.view', 'new_hires.view')"
    )
