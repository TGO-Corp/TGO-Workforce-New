"""add employees.phone

Optional contact number, settable from the New Hire form and the Manage
Employees edit dialog alongside the rest of basic info.

Revision ID: d4e8a1c6f9b2
Revises: c5f2a8d4e9b3
Create Date: 2026-11-18 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e8a1c6f9b2"
down_revision: Union[str, None] = "c5f2a8d4e9b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("phone", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "phone")
