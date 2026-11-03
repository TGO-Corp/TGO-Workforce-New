"""create portal_events, portal_sync_state; add notifications.source; seed grants

Backs the live Onboarding & Offboarding Portal feed: the events pulled from the
portal, the poller's per-dataset progress, an origin label on notifications, and
the default grants for portal_activity.view (People Ops and HR; a Super Admin can
change them from User Management). Mirrors DEFAULT_GRANTS in
app/services/permissions.py.

Revision ID: f3c9a6d2b8e4
Revises: e1b5c8a3d7f2
Create Date: 2026-11-03 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3c9a6d2b8e4"
down_revision: Union[str, None] = "e1b5c8a3d7f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portal_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("entity", sa.String(30), nullable=False),
        sa.Column("record_id", sa.String(100), nullable=False),
        sa.Column("state", sa.String(60), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("detail", sa.Text()),
        sa.Column("employee_name", sa.String(200)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("entity", "record_id", "state", name="uq_portal_event_state"),
    )
    op.create_index("ix_portal_events_entity", "portal_events", ["entity"])
    op.create_index("ix_portal_events_occurred_at", "portal_events", ["occurred_at"])

    op.create_table(
        "portal_sync_state",
        sa.Column("entity", sa.String(30), primary_key=True),
        sa.Column("cursor", sa.DateTime(timezone=True)),
        sa.Column("initialized_at", sa.DateTime(timezone=True)),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(300)),
    )

    op.add_column("notifications", sa.Column("source", sa.String(40), nullable=True))

    op.execute(
        "INSERT INTO role_permissions (role, permission) VALUES "
        "('people_ops', 'portal_activity.view'), ('hr', 'portal_activity.view') "
        "ON CONFLICT DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE permission = 'portal_activity.view'")
    op.drop_column("notifications", "source")
    op.drop_table("portal_sync_state")
    op.drop_table("portal_events")
