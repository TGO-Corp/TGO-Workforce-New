"""add password_hash to accounts

Backs the email + password fallback sign-in (POST /auth/login). Nullable: only
accounts that are given a password (the seeded fallback admin) can use it.

Revision ID: b1c7e3f5a8d2
Revises: a9e6c2d4f7b1
Create Date: 2026-10-08 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c7e3f5a8d2"
down_revision: Union[str, None] = "a9e6c2d4f7b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "password_hash")
