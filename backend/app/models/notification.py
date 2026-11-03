"""In-app notifications — one row per recipient per event, backing the nav
bell icon and its dropdown. Distinct from ActivityLog (app/models/activity_log.py):
ActivityLog is a permanent, account-agnostic audit trail of what happened;
Notification is a personal, dismissable inbox of what a specific person
should know about. An action can (and often does) write to both — see
app/services/notify.py.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base
from app.models.permission import Permission


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # ondelete="CASCADE" (unlike ActivityLog's SET NULL): a notification only
    # ever means something to its one recipient, so it has no reason to
    # outlive that account the way an audit-trail row does.
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    # In-app path the bell dropdown navigates to on click, e.g.
    # "/attendance-violations" — not an external URL.
    link: Mapped[str | None] = mapped_column(String(500))

    # Which outside system raised this, when it isn't Workforce itself - e.g.
    # "onboarding_portal" for the Onboarding & Offboarding Portal. Null for
    # everything Workforce generates. The UI uses it to label the origin.
    source: Mapped[str | None] = mapped_column(String(40))

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    # The permission notify_permission_holders() gated this notification on
    # when it was created (see app/services/notify.py) — null for a
    # notification with no module tie (e.g. notify_account()'s general-
    # purpose sends). GET /notifications re-checks this against the caller's
    # *current* permissions (not a snapshot), so a notification stops showing
    # up the moment a Super Admin revokes the matrix grant that qualified the
    # recipient for it in the first place — same module-siloed rule as
    # Activity Logs, not just at creation time.
    required_permission: Mapped[Permission | None] = mapped_column(
        Enum(
            Permission,
            name="permission",
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
            create_type=False,
        ),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
