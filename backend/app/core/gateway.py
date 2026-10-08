"""TGO Gateway single sign-on.

When GATEWAY_URL is set, the Gateway (gateway.tgocorp.com) owns sign-in: it
sets the shared `tgo_gateway_session` cookie on .tgocorp.com, and this backend
only forwards that cookie to the Gateway's POST /api/auth/verify with
{"toolId": GATEWAY_TOOL_ID} and asks whether its holder may open TGO
Workforce. The in-app Zoho login is switched off in that mode (see
app/api/routes/auth.py).

Who gets in is the Gateway's call (Admin -> Tool Access). What they can do once
inside is still this app's own role + permission matrix: a person's first
Gateway visit creates their Account here (as VIEWER, or from a PendingInvite),
and User Management promotes them from there, exactly as with Zoho sign-in.

Requires this app to be served from a .tgocorp.com host (the frontend AND this
backend), or the browser never sends the Gateway cookie here at all.
"""

import hashlib
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode

import httpx

from app.core.config import Settings

GatewayStatus = Literal["ok", "unauthenticated", "denied", "unavailable"]


@dataclass(frozen=True)
class GatewayProfile:
    user_id: str
    email: str
    name: str | None
    role: str | None


@dataclass(frozen=True)
class GatewayResult:
    status: GatewayStatus
    profile: GatewayProfile | None = None
    # The email the Gateway reported for a "denied" verdict, when it shared one
    # — lets the Activity Log say WHO was turned away.
    email: str | None = None


# The frontend polls several endpoints every 15s while a tab is open, and each
# request would otherwise mean a round trip to the Gateway. A verdict is reused
# for a few seconds per Gateway session: short enough that a revoked grant or a
# Gateway sign-out still lands almost at once. Same TTL as the Assignments app.
VERIFY_TTL_SECONDS = 15.0
_MAX_CACHE_ENTRIES = 500
_verify_cache: dict[str, tuple[float, GatewayResult]] = {}


def clear_verify_cache() -> None:
    _verify_cache.clear()


def gateway_token(request_cookies: dict[str, str], settings: Settings) -> str:
    return request_cookies.get(settings.gateway_session_cookie, "")


def token_fingerprint(token: str) -> str:
    """Stored in this app's own session cookie so a local AccountSession is tied
    to one Gateway session. A new Gateway sign-in (new token) starts a new
    AccountSession; a Super Admin's terminate stays in force until then."""
    return hashlib.sha256(token.encode()).hexdigest()[:32]


def login_url(settings: Settings, next_url: str) -> str:
    return f"{settings.gateway_base_url}/login?{urlencode({'next': next_url})}"


def logout_url(settings: Settings) -> str:
    # GET clears the Gateway cookie and lands on the Gateway login page.
    return f"{settings.gateway_base_url}/auth/logout"


async def verify_gateway_session(token: str, settings: Settings) -> GatewayResult:
    if not token:
        return GatewayResult("unauthenticated")

    cached = _verify_cache.get(token)
    if cached and time.monotonic() - cached[0] < VERIFY_TTL_SECONDS:
        return cached[1]

    result = await _ask_gateway(token, settings)
    # Never cache "unavailable": the next request should try the Gateway again.
    if result.status != "unavailable":
        if len(_verify_cache) >= _MAX_CACHE_ENTRIES:
            _verify_cache.clear()
        _verify_cache[token] = (time.monotonic(), result)
    return result


async def _ask_gateway(token: str, settings: Settings) -> GatewayResult:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.gateway_base_url}/api/auth/verify",
                json={"toolId": settings.gateway_tool_id},
                # A raw header, not httpx's per-request cookies= (deprecated in
                # 0.28): the value is forwarded exactly as the browser sent it.
                headers={"cookie": f"{settings.gateway_session_cookie}={token}"},
            )
    except httpx.HTTPError:
        return GatewayResult("unavailable")

    if response.status_code == 401:
        return GatewayResult("unauthenticated")
    if response.status_code == 403:
        return GatewayResult("denied", email=_email_from_body(response))
    if response.status_code != 200:
        return GatewayResult("unavailable")

    try:
        body = response.json()
    except ValueError:
        return GatewayResult("unavailable")
    email = str(body.get("email") or "").strip().lower()
    if not body.get("allowed") or not email:
        return GatewayResult("denied", email=email or None)
    return GatewayResult(
        "ok",
        GatewayProfile(
            user_id=str(body.get("userId") or ""),
            email=email,
            name=(str(body["name"]).strip() or None) if body.get("name") else None,
            role=body.get("role"),
        ),
    )


def _email_from_body(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    email = str(body.get("email") or "").strip().lower()
    return email or None
