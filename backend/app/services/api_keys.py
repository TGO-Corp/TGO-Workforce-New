"""API key generation and authentication for the read-only public API
(app/api/routes/public_api.py). Keys look like ``tgo_live_<43 random chars>``;
only their SHA-256 hash is stored (see app/models/api_key.py)."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.api_key import ApiKey

KEY_PREFIX = "tgo_live_"
API_SCOPES: tuple[str, ...] = ("employees", "awards")

# last_used_at is only rewritten when it is older than this, so a busy
# integration doesn't turn every read into a write.
LAST_USED_REFRESH = timedelta(seconds=60)


def hash_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_key() -> tuple[str, str, str]:
    """Returns (full token, display prefix, hash). The full token is only ever
    available here, at creation."""
    token = KEY_PREFIX + secrets.token_urlsafe(32)
    return token, token[: len(KEY_PREFIX) + 4], hash_key(token)


def _extract_token(authorization: str | None, x_api_key: str | None) -> str | None:
    if x_api_key:
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def require_api_key(scope: str):
    """Dependency factory: authenticates the caller's key and checks it may
    read `scope`. Stashes the key's id/name on request.state so the request-log
    middleware can attribute the call."""

    async def _dependency(
        request: Request,
        db: Annotated[AsyncSession, Depends(get_db)],
        authorization: Annotated[str | None, Header()] = None,
        x_api_key: Annotated[str | None, Header()] = None,
    ) -> ApiKey:
        token = _extract_token(authorization, x_api_key)
        if not token:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="Missing API key. Send it as 'Authorization: Bearer <key>' or 'X-API-Key: <key>'.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        result = await db.execute(select(ApiKey).where(ApiKey.key_hash == hash_key(token)))
        key = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if key is None or key.revoked_at is not None or (key.expires_at and key.expires_at <= now):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, revoked or expired API key.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        request.state.api_key_id = key.id
        request.state.api_key_name = key.name
        if scope not in (key.scopes or []):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"This key can't read '{scope}'.")
        if key.last_used_at is None or now - key.last_used_at > LAST_USED_REFRESH:
            key.last_used_at = now
            await db.commit()
        return key

    return _dependency
