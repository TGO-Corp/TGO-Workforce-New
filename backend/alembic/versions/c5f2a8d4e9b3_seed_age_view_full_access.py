"""seed age.view for admin and super_admin

Admin and Super Admin can now have age display switched off from the permission
matrix (age.view is the one permission they do not get automatically), so they
need an explicit grant to keep seeing ages until a Super Admin turns it off.

Revision ID: c5f2a8d4e9b3
Revises: b8e1f5a3d7c2
Create Date: 2026-11-09 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5f2a8d4e9b3"
down_revision: Union[str, None] = "b8e1f5a3d7c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO role_permissions (role, permission) VALUES "
        "('admin', 'age.view'), ('super_admin', 'age.view') ON CONFLICT DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE role IN ('admin', 'super_admin') AND permission = 'age.view'")
