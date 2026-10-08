"""Server-side session tracking — added specifically so a Super Admin can see
who's currently signed in (Dashboard + User Management "active sessions"
panel) and forcibly end a specific browser's session.

Before this existed, sign-in was a purely stateless signed cookie holding
just {account_id} — nothing server-side to list or revoke. Login now also
stamps a session id into the cookie (see app/api/routes/auth.py's
zoho_callback); app/core/auth.py's get_current_account checks that id against
this table when present, so setting revoked_at here takes effect on that
browser's very next request, with no cookie-side change needed.

Backward-compatible on purpose: a cookie from *before* this feature shipped
has no session id in it at all, so get_current_account skips the revocation
check entirely for those — they keep working until they naturally expire or
log out, they just won't show up in the active-sessions list or be
terminable until whoever's behind them signs in again.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.account import Account


class AccountSession(Base):
    __tablename__ = "account_sessions"

    # This id IS the value stored in the signed cookie (request.session
    # ["session_id"]) — a plain UUID, not a secret on its own, since the
    # cookie itself is what's signed/tamper-proof; this table only decides
    # whether that id is still live.
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # CASCADE (not SET NULL like ActivityLog.account_id) — a session with no
    # account makes no sense to keep around; deleting the account should take
    # its live sessions with it.
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    ip_address: Mapped[str | None] = mapped_column(String(64))
    # Best-effort, parsed once at login from the User-Agent header — see
    # app/services/session_info.py. There is no way for any web server to
    # learn a literal PC/device name (e.g. "DESKTOP-ABC123"); this is the
    # closest real substitute ("Windows 11 · Chrome 129").
    device_label: Mapped[str | None] = mapped_column(String(150))
    # Best-effort city/country from a public IP geolocation lookup — approximate,
    # and null for local/private IPs or if the lookup fails/times out (never
    # blocks or fails a login on its own).
    location_label: Mapped[str | None] = mapped_column(String(150))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Updated (throttled — see get_current_account) on requests from this
    # session while it's active; this is what "Active now" / "Active 5
    # minutes ago" is computed from.
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Which module (page) this browser was last reported in — a display label
    # such as "HMO Management", mapped server-side from the path the app
    # reports (see app/services/session_info.py's module_for_path). Kept on
    # the session after they navigate away or sign out, which is what powers
    # the panel's "Last in ..." as well as "In ...".
    current_module: Mapped[str | None] = mapped_column(String(80))
    module_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set either by POST /accounts/sessions/{id}/terminate (Super Admin) or by
    # this same browser calling POST /auth/logout. Null = still live.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    account: Mapped["Account"] = relationship()
