"""add current_module / module_changed_at to account_sessions

Powers the Active Sessions panel's "In <module>" / "Last in <module>": the app
reports the page it's on (POST /auth/me/presence) and the label is stored on
the session row, where it outlives the person leaving the page or signing out.

Revision ID: a9e6c2d4f7b1
Revises: f8d5b1c3e6a9
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9e6c2d4f7b1"
down_revision: Union[str, None] = "f8d5b1c3e6a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "account_sessions", sa.Column("current_module", sa.String(length=80), nullable=True)
    )
    op.add_column(
        "account_sessions",
        sa.Column("module_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("account_sessions", "module_changed_at")
    op.drop_column("account_sessions", "current_module")
