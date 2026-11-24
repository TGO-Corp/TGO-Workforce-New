"""add employees.photo_url

Same data: URI-or-hosted-URL pattern as Account.photo_url (b1c7e3f5a8d2 and
friends) — set from the New Hire form and the Manage Employees edit
dialog's new Employee Photo field.

Revision ID: b6d2e4f8a1c3
Revises: a3f7c1d8e2b4
Create Date: 2026-11-25 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b6d2e4f8a1c3"
down_revision: Union[str, None] = "a3f7c1d8e2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("photo_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "photo_url")
