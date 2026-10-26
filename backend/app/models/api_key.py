"""API Access — Super Admin-managed keys that let other internal apps read
Workforce data over a small read-only HTTP API (app/api/routes/public_api.py),
plus a log of every request made to that API.

Only a SHA-256 hash of each key is stored (the full key is shown once, at
creation); key_prefix is the first few characters, kept purely so a person can
recognise which key is which in the list. Keys are high-entropy random tokens,
so a fast hash is the right tool here — there's nothing to brute-force.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    # Which datasets the key may read — a subset of API_SCOPES in
    # app/services/api_keys.py (today "employees" and "awards").
    scopes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    created_by_label: Mapped[str] = mapped_column(String(200), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApiRequestLog(Base):
    """One row per request to /public/v1/*, successful or not. api_key_id is
    null when the request never identified a key (missing/invalid key), and
    SET NULL when the key is later deleted — key_name is snapshotted so the
    activity feed still says who it was."""

    __tablename__ = "api_request_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("api_keys.id", ondelete="SET NULL"), index=True
    )
    key_name: Mapped[str | None] = mapped_column(String(120))
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    # The route template's first segment, e.g. "/employees" — what the
    # Overview groups by (never the full URL, so IDs don't fragment the counts).
    endpoint: Mapped[str] = mapped_column(String(100), nullable=False)
    path: Mapped[str] = mapped_column(String(300), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    client_ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
