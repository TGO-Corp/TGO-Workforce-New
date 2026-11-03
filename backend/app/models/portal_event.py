"""Activity pulled from the Onboarding & Offboarding Portal (see
app/services/portal_sync.py), kept so the Dashboard can show a live feed and
current counts without calling the portal on every page load.

One row per (record, status): a record moving PENDING -> APPROVED -> COMPLETED
leaves three rows, which is exactly the "what happened" history the feed shows.
Deliberately holds no sensitive detail - no pay amounts, no interview feedback
or ratings - just who, what, and the status.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class PortalEvent(Base):
    __tablename__ = "portal_events"
    __table_args__ = (UniqueConstraint("entity", "record_id", "state", name="uq_portal_event_state"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # new_hire | exit_request | final_pay | asset_return | exit_interview
    entity: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    record_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # The record's status at this point ("recorded" for things with no status).
    state: Mapped[str] = mapped_column(String(60), nullable=False)
    # "new" the first time the record is seen live, "update" for a status change
    # (and for everything picked up by the first, silent catch-up sync).
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    employee_name: Mapped[str | None] = mapped_column(String(200))
    # When it happened in the portal (its own updatedAt/createdAt), not when
    # Workforce noticed.
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PortalSyncState(Base):
    """Where the poller got to for each dataset, and whether it last worked."""

    __tablename__ = "portal_sync_state"

    entity: Mapped[str] = mapped_column(String(30), primary_key=True)
    # Newest timestamp seen; the next poll asks only for records changed since.
    cursor: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Null until the first (silent) catch-up has finished - nothing before that
    # raises notifications, so connecting the portal doesn't flood everyone.
    initialized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(300))
