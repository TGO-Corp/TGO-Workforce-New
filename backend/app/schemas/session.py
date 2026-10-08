import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.account import AccountRole


class AccountPresence(BaseModel):
    """One row per account (not per session) — backs the Dashboard/User
    Management "active sessions" panel. Super Admin only; see
    GET /accounts/sessions in app/api/routes/accounts.py."""

    account_id: uuid.UUID
    name: str
    email: str
    role: AccountRole
    # Present only when there's a live (non-revoked) session — that's what
    # the "Terminate" button sends to POST /accounts/sessions/{id}/terminate.
    # Null means either the account has never signed in, or their last
    # session was already terminated/logged out and they haven't signed back
    # in since.
    session_id: uuid.UUID | None
    status: Literal["active_now", "active_ago", "never"]
    last_seen_at: datetime | None
    ip_address: str | None
    location_label: str | None
    device_label: str | None
    # The module the latest session was last reported in (see
    # AccountSession.current_module), and when they got there.
    current_module: str | None = None
    module_changed_at: datetime | None = None
