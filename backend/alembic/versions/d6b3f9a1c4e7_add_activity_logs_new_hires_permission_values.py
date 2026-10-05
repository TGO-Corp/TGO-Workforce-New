"""add activity_logs.view / new_hires.view enum values to permission

Activity Logs and Onboarding New Hires get their own permission-matrix rows
so a role (Viewer, by default) can be kept out of them from User Management.

This migration ONLY adds the enum values — it must NOT also use them in the
same migration/transaction (same restriction as d4e8b2f6a9c1); the grants
are seeded by the next migration.

Revision ID: d6b3f9a1c4e7
Revises: c3d7a2f9e5b1
Create Date: 2026-10-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6b3f9a1c4e7"
down_revision: Union[str, None] = "c3d7a2f9e5b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE permission ADD VALUE IF NOT EXISTS 'activity_logs.view'")
    op.execute("ALTER TYPE permission ADD VALUE IF NOT EXISTS 'new_hires.view'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without recreating the type.
    pass
