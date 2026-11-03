"""add portal_activity.view enum value to permission

Live Onboarding & Offboarding Portal activity gets its own permission-matrix
row. This migration ONLY adds the enum value - it must NOT also use it in the
same transaction (same restriction as d6b3f9a1c4e7); the grants are seeded by
the next migration.

Revision ID: e1b5c8a3d7f2
Revises: d6a2e9c4b7f1
Create Date: 2026-11-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1b5c8a3d7f2"
down_revision: Union[str, None] = "d6a2e9c4b7f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE permission ADD VALUE IF NOT EXISTS 'portal_activity.view'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without recreating the type.
    pass
