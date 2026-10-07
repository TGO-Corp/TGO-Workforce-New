"""add show_intro preference to accounts

Self-service toggle (default on) for the post-login intro video — same
on/off pattern as animations_enabled (d5f9a3c1b8e4).

Revision ID: f8d5b1c3e6a9
Revises: e7c4a0b2d5f8
Create Date: 2026-10-07 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8d5b1c3e6a9"
down_revision: Union[str, None] = "e7c4a0b2d5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("show_intro", sa.Boolean(), server_default="true", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("accounts", "show_intro")
