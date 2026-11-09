"""seed age.view default grants

Ages were visible to everyone, so every matrix role keeps seeing them; a Super
Admin can switch it off per role from User Management. Mirrors DEFAULT_GRANTS in
app/services/permissions.py.

Revision ID: b8e1f5a3d7c2
Revises: a4d7e2b9c6f1
Create Date: 2026-11-09 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8e1f5a3d7c2"
down_revision: Union[str, None] = "a4d7e2b9c6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLES = ["people_ops", "hr", "projects", "recruitment_lead", "onboarding_specialist", "viewer"]


def upgrade() -> None:
    values = ", ".join(f"('{role}', 'age.view')" for role in ROLES)
    op.execute(f"INSERT INTO role_permissions (role, permission) VALUES {values} ON CONFLICT DO NOTHING")


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE permission = 'age.view'")
