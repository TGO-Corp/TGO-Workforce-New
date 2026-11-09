"""add age.view enum value to permission

Whether a role sees employees' ages gets its own permission-matrix row. This
migration ONLY adds the enum value - it must NOT also use it in the same
transaction (same restriction as d6b3f9a1c4e7); the grants are seeded by the
next migration.

Revision ID: a4d7e2b9c6f1
Revises: f3c9a6d2b8e4
Create Date: 2026-11-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4d7e2b9c6f1"
down_revision: Union[str, None] = "f3c9a6d2b8e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE permission ADD VALUE IF NOT EXISTS 'age.view'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without recreating the type.
    pass
