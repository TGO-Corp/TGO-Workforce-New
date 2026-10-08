"""add saved_filters to accounts

Per-account saved list filters (today: the Anniversaries and Birthdays pages'
month arrangement, office and time range) so a person's choice follows them
across devices. A JSON object keyed by page, validated by SavedFilters in
app/schemas/account.py; empty by default.

Revision ID: c2d8f4a6b9e1
Revises: b1c7e3f5a8d2
Create Date: 2026-10-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d8f4a6b9e1"
down_revision: Union[str, None] = "b1c7e3f5a8d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("saved_filters", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("accounts", "saved_filters")
