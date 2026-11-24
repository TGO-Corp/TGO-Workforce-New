"""add employee extended profile fields

Personal (preferred_name, personal_email, address), Employment
(employment_type, work_arrangement, supervisor), Company Accounts
(tgo_email, lms_email, vonage_extension), Emergency Contact
(emergency_contact_name/relationship/number), and Additional Info
(reason_for_separation, hr_remarks) — the fields added to the New Hire and
Manage Employees edit forms' new grouped sections.

Revision ID: a3f7c1d8e2b4
Revises: d4e8a1c6f9b2
Create Date: 2026-11-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f7c1d8e2b4"
down_revision: Union[str, None] = "d4e8a1c6f9b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("employees", sa.Column("address", sa.String(length=300), nullable=True))
    op.add_column("employees", sa.Column("personal_email", sa.String(length=254), nullable=True))
    op.add_column("employees", sa.Column("preferred_name", sa.String(length=100), nullable=True))
    op.add_column("employees", sa.Column("employment_type", sa.String(length=50), nullable=True))
    op.add_column("employees", sa.Column("work_arrangement", sa.String(length=50), nullable=True))
    op.add_column("employees", sa.Column("supervisor", sa.String(length=200), nullable=True))
    op.add_column("employees", sa.Column("tgo_email", sa.String(length=254), nullable=True))
    op.add_column("employees", sa.Column("lms_email", sa.String(length=254), nullable=True))
    op.add_column("employees", sa.Column("vonage_extension", sa.String(length=20), nullable=True))
    op.add_column(
        "employees", sa.Column("emergency_contact_name", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "employees",
        sa.Column("emergency_contact_relationship", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "employees", sa.Column("emergency_contact_number", sa.String(length=30), nullable=True)
    )
    op.add_column(
        "employees", sa.Column("reason_for_separation", sa.String(length=500), nullable=True)
    )
    op.add_column("employees", sa.Column("hr_remarks", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "hr_remarks")
    op.drop_column("employees", "reason_for_separation")
    op.drop_column("employees", "emergency_contact_number")
    op.drop_column("employees", "emergency_contact_relationship")
    op.drop_column("employees", "emergency_contact_name")
    op.drop_column("employees", "vonage_extension")
    op.drop_column("employees", "lms_email")
    op.drop_column("employees", "tgo_email")
    op.drop_column("employees", "supervisor")
    op.drop_column("employees", "work_arrangement")
    op.drop_column("employees", "employment_type")
    op.drop_column("employees", "preferred_name")
    op.drop_column("employees", "personal_email")
    op.drop_column("employees", "address")
