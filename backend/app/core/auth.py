"""Session-backed auth, wired to the Zoho OAuth login flow — or, once
GATEWAY_URL is set, to the TGO Gateway (see resolve_gateway_account below and
app/core/gateway.py), which then replaces the Zoho login entirely.

The session itself is a signed, httpOnly cookie (Starlette's SessionMiddleware,
added in app/main.py) holding the account id plus (since the "active
sessions" feature — see app/models/session.py) a session id. get_current_account()
resolves the account id to a live Account row (or None if there's no
session, the account was deleted, or it's been deactivated), and — when a
session id is also present — checks it against AccountSession for
revocation, so a Super Admin's POST /accounts/sessions/{id}/terminate takes
effect on that browser's very next request. require_account() is the same
check for routes that should outright reject a signed-out request instead of
treating it as "acting as System" (see app/api/routes/employees.py for that
pattern).

Module-level access (can this role see/use Onboarding at all, etc.) is
governed by the dynamic permission matrix — see require_permission() below
and app/services/permissions.py. Admin and Super Admin bypass it entirely.
"""

import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.gateway import (
    GatewayProfile,
    gateway_token,
    token_fingerprint,
    verify_gateway_session,
)
from app.models.account import Account, AccountRole
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.models.pending_invite import PendingInvite
from app.models.permission import Permission
from app.models.session import AccountSession
from app.services.activity_log import record_activity
from app.services.app_settings import get_app_settings
from app.services.permissions import PERMISSION_LABELS, has_permission
from app.services.session_info import get_client_ip, lookup_location_label, parse_device_label

# How stale last_seen_at has to be before a request bothers updating it — a
# write on literally every authenticated request (this app polls several
# endpoints every 15s while a tab is open) would be wasteful; this still
# keeps "Active now" accurate to within a minute, which is plenty for a
# presence indicator.
SESSION_LAST_SEEN_THROTTLE = timedelta(seconds=60)

# Session key for a Super Admin's active "sandbox" — see /auth/sandbox/enter
# and /auth/sandbox/exit in app/api/routes/auth.py. Only ever consulted for
# an account whose *real* role is SUPER_ADMIN (see get_effective_role below),
# so this can't be used to smuggle in extra access for anyone else even if a
# session somehow carried a stale value.
SANDBOX_SESSION_KEY = "sandbox_role"

# Set by POST /auth/login (the email + password fallback). In Gateway mode a
# session carrying this is honoured on its own, without a Gateway cookie — that
# is the whole point of a fallback for when the Gateway is down or unreachable.
AUTH_METHOD_SESSION_KEY = "auth_method"
AUTH_METHOD_PASSWORD = "password"


def get_effective_role(account: Account, request: Request) -> AccountRole:
    """The role every permission check in this module actually uses — the
    real persisted account.role, unless account is a genuine Super Admin
    with an active sandbox override in their session. This is a *live* role
    switch (not just a UI preview): every dependency below enforces exactly
    what the sandboxed role could do, including losing admin/super-admin
    access — that's the point, it's how a Super Admin proves the matrix
    really works instead of just how it looks. See /auth/sandbox/enter."""
    if account.role != AccountRole.SUPER_ADMIN:
        return account.role
    raw = request.session.get(SANDBOX_SESSION_KEY)
    if not raw:
        return account.role
    try:
        return AccountRole(raw)
    except ValueError:
        return account.role


async def _account_from_session(request: Request, db: AsyncSession) -> tuple[Account | None, bool]:
    """This app's own signed session cookie -> (live Account or None, revoked).
    `revoked` is True only when the cookie names a session a Super Admin
    terminated (or that logged out), which Gateway mode needs to tell apart
    from "no session yet"."""
    raw_id = request.session.get("account_id")
    if not raw_id:
        return None, False
    try:
        account_id = uuid.UUID(raw_id)
    except ValueError:
        return None, False
    account = await db.get(Account, account_id)
    if account is None or not account.is_active:
        return None, False

    # A cookie set before the "active sessions" feature shipped has no
    # session_id in it at all — skip the revocation check entirely for those
    # rather than treating a missing id as "revoked" (that would force-log-out
    # every already-signed-in person the moment this deploys).
    raw_session_id = request.session.get("session_id")
    if raw_session_id:
        try:
            session_id = uuid.UUID(raw_session_id)
        except ValueError:
            session_id = None
        if session_id is not None:
            account_session = await db.get(AccountSession, session_id)
            if account_session is None or account_session.revoked_at is not None:
                return None, True
            now = datetime.now(UTC)
            if now - account_session.last_seen_at >= SESSION_LAST_SEEN_THROTTLE:
                account_session.last_seen_at = now
                await db.commit()

    return account, False


# --- TGO Gateway mode ---------------------------------------------------------
# Session key tying this app's session cookie to one Gateway session — see
# token_fingerprint in app/core/gateway.py.
GATEWAY_FINGERPRINT_SESSION_KEY = "gateway_fp"

GatewaySignInStatus = Literal[
    "signed_in",
    # No Gateway session, or it expired: sign in at the Gateway.
    "signed_out",
    # A Super Admin terminated this session here. It stays ended until the
    # person signs out of the Gateway and back in (a new Gateway session).
    "ended",
    # Signed in at the Gateway, but not granted TGO Workforce there.
    "denied",
    # The Gateway didn't answer. Fail closed, never fall back to Zoho.
    "unavailable",
    # Same meanings as the Zoho callback's ?error=inactive / ?error=invite_only.
    "inactive",
    "invite_only",
]

GATEWAY_STATUS_DETAIL: dict[str, str] = {
    "denied": (
        "Your TGO Gateway account doesn't have access to TGO Workforce. "
        "Request it from the Gateway."
    ),
    "unavailable": "The TGO Gateway isn't responding. Try again in a minute.",
    "inactive": "Your account isn't active yet. Contact your admin.",
    "invite_only": (
        "Sign-in is currently invite-only. Ask an admin to add you from User Management."
    ),
}


@dataclass(frozen=True)
class GatewaySignIn:
    status: GatewaySignInStatus
    account: Account | None = None
    # For "denied": the email the Gateway reported, so the login page can say
    # which Gateway account was turned away.
    email: str | None = None


async def resolve_gateway_account(
    request: Request, db: AsyncSession, settings: Settings
) -> GatewaySignIn:
    """Gateway mode's replacement for reading this app's own session alone.

    The Gateway decides whether the person is signed in and may open TGO
    Workforce; the Account row (role, restrictions, preferences) is still this
    app's, matched on email. The local session cookie is kept on top, bound to
    the Gateway session, so the active-sessions panel, terminate and sandbox
    all keep working as they did with Zoho."""
    token = gateway_token(request.cookies, settings)
    result = await verify_gateway_session(token, settings)
    if result.status == "unauthenticated":
        return GatewaySignIn("signed_out")
    if result.status != "ok" or result.profile is None:
        if result.status == "denied":
            await _log_gateway_denial(db, token, result.email)
        if result.status == "denied":
            return GatewaySignIn("denied", email=result.email)
        return GatewaySignIn(result.status)  # unavailable
    profile = result.profile
    fingerprint = token_fingerprint(token)

    # The common path: this browser already has a session here for this same
    # Gateway session.
    if request.session.get(GATEWAY_FINGERPRINT_SESSION_KEY) == fingerprint:
        account, revoked = await _account_from_session(request, db)
        if revoked:
            return GatewaySignIn("ended")
        if account is not None and account.email.lower() == profile.email:
            return GatewaySignIn("signed_in", account)

    # First visit, or a new Gateway sign-in (possibly as someone else).
    account = await _upsert_gateway_account(db, profile, settings)
    if account is None:
        return GatewaySignIn("invite_only")
    if not account.is_active:
        await record_activity(
            db,
            action="Sign-in rejected: account inactive",
            category=ActivityCategory.ACCESS,
            account=account,
            # The email that tried to sign in, not the display name.
            actor_label=account.email,
            severity=ActivitySeverity.WARNING,
            commit=True,
        )
        return GatewaySignIn("inactive")

    client_ip = get_client_ip(request)
    account_session = AccountSession(
        id=uuid.uuid4(),
        account_id=account.id,
        ip_address=client_ip,
        device_label=parse_device_label(request.headers.get("user-agent")),
        location_label=await lookup_location_label(client_ip),
    )
    db.add(account_session)
    account.last_login_at = datetime.now(UTC)
    await db.commit()
    # updated_at is server-set on that UPDATE; load it now; a lazy load later
    # (building AccountRead) would be sync IO on an async session.
    await db.refresh(account)

    request.session.pop(SANDBOX_SESSION_KEY, None)
    request.session["account_id"] = str(account.id)
    request.session["session_id"] = str(account_session.id)
    request.session[GATEWAY_FINGERPRINT_SESSION_KEY] = fingerprint

    await record_activity(
        db,
        action="Signed in via TGO Gateway",
        category=ActivityCategory.ACCESS,
        account=account,
        details={"ip_address": client_ip} if client_ip else None,
        commit=True,
    )
    return GatewaySignIn("signed_in", account)


# A denied Gateway session is re-checked on every poll (every 15s per open tab),
# so log each denied session once per window instead of once per poll.
_DENIAL_LOG_WINDOW_SECONDS = 30 * 60
_MAX_DENIAL_ENTRIES = 500
_denial_logged_at: dict[str, float] = {}


async def _log_gateway_denial(db: AsyncSession, token: str, email: str | None) -> None:
    key = token_fingerprint(token)
    now = time.monotonic()
    last = _denial_logged_at.get(key)
    if last is not None and now - last < _DENIAL_LOG_WINDOW_SECONDS:
        return
    if len(_denial_logged_at) >= _MAX_DENIAL_ENTRIES:
        _denial_logged_at.clear()
    _denial_logged_at[key] = now
    await record_activity(
        db,
        action="Sign-in denied: no access to TGO Workforce in the Gateway",
        category=ActivityCategory.ACCESS,
        actor_label=email or "Unknown (Gateway shared no email)",
        severity=ActivitySeverity.WARNING,
        commit=True,
    )


async def _upsert_gateway_account(
    db: AsyncSession, profile: GatewayProfile, settings: Settings
) -> Account | None:
    """The Gateway's version of the Zoho callback's upsert: same PendingInvite,
    invite-only and admin-allowlist rules, matched on email instead of ZUID
    (the Gateway doesn't hand out ZUIDs). None means invite-only rejected it."""
    result = await db.execute(select(Account).where(func.lower(Account.email) == profile.email))
    account = result.scalar_one_or_none()

    if account is None:
        invite_result = await db.execute(
            select(PendingInvite).where(PendingInvite.email == profile.email)
        )
        pending_invite = invite_result.scalar_one_or_none()
        if pending_invite is None and profile.email not in settings.admin_email_set:
            app_settings = await get_app_settings(db)
            if app_settings.invite_only_signup:
                await db.commit()  # persist the get-or-create'd settings row
                await record_activity(
                    db,
                    action="Sign-in rejected: invite required",
                    category=ActivityCategory.ACCESS,
                    actor_label=profile.email,
                    severity=ActivitySeverity.WARNING,
                    commit=True,
                )
                return None

        first_name, _, last_name = (profile.name or "").partition(" ")
        account = Account(
            # zoho_user_id is NOT NULL + unique; a Gateway-created account
            # has no ZUID, so it carries the Gateway's user id instead.
            zoho_user_id=f"gateway:{profile.user_id or profile.email}",
            email=profile.email,
            first_name=first_name or None,
            last_name=last_name or None,
            display_name=profile.name,
            role=pending_invite.role if pending_invite else AccountRole.VIEWER,
        )
        db.add(account)
        if pending_invite is not None:
            await db.delete(pending_invite)

    if profile.email in settings.admin_email_set:
        account.role = AccountRole.ADMIN

    try:
        await db.commit()
    except IntegrityError:
        # Two first requests raced to create the same account; use the winner.
        await db.rollback()
        result = await db.execute(select(Account).where(func.lower(Account.email) == profile.email))
        return result.scalar_one()
    await db.refresh(account)
    return account


async def get_current_account(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Account | None:
    if not settings.gateway_enabled:
        account, _ = await _account_from_session(request, db)
        return account

    if request.session.get(AUTH_METHOD_SESSION_KEY) == AUTH_METHOD_PASSWORD:
        local_account, _ = await _account_from_session(request, db)
        if local_account is not None:
            return local_account
        # Stale or revoked local session: fall through to the Gateway check.

    sign_in = await resolve_gateway_account(request, db, settings)
    if sign_in.status == "signed_in":
        return sign_in.account
    if sign_in.status == "unavailable":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=GATEWAY_STATUS_DETAIL["unavailable"],
        )
    if sign_in.status in GATEWAY_STATUS_DETAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=GATEWAY_STATUS_DETAIL[sign_in.status]
        )
    return None  # signed_out / ended


async def require_account(
    account: Account | None = Depends(get_current_account),
) -> Account:
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    return account


async def require_admin(
    account: Account = Depends(require_account),
    request: Request = None,  # type: ignore[assignment]
) -> Account:
    """Same as require_account, but also rejects anyone who isn't Admin or
    Super Admin with 403 — and anyone whose account is restricted
    (Account.is_restricted), regardless of role. Used to gate /accounts
    (user management) and anything else that should only ever be reachable
    by one of those two — Super Admin has every Admin capability plus
    permission-matrix editing (require_super_admin below), it's never a
    *narrower* role than Admin. Uses the effective role (real role, unless
    sandboxed — see get_effective_role), so a Super Admin sandboxing as a
    non-admin role genuinely loses this access too."""
    if account.is_restricted or get_effective_role(account, request) not in (
        AccountRole.ADMIN,
        AccountRole.SUPER_ADMIN,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return account


async def require_super_admin(
    account: Account = Depends(require_account),
    request: Request = None,  # type: ignore[assignment]
) -> Account:
    """Gates the permission-matrix endpoints only (GET/PUT
    app/api/routes/permissions.py) — deliberately narrower than require_admin.
    A regular Admin has full access to every module already; reconfiguring
    *what every other role* is allowed to do is Super Admin's alone. Uses the
    effective role, same as require_admin — deliberately NOT used to gate
    /auth/sandbox/enter or /exit themselves, which always check the real
    account.role directly so a sandboxed Super Admin can always get back."""
    if account.is_restricted or get_effective_role(account, request) != AccountRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin access required")
    return account


def require_permission(
    permission: Permission,
) -> Callable[[Account, AsyncSession, Request], Awaitable[Account]]:
    """Dependency factory: Depends(require_permission(Permission.X)) rejects
    with 403 any signed-in account whose *effective* role doesn't currently
    hold that permission (Admin/Super Admin always pass — see
    FULL_ACCESS_ROLES in app/services/permissions.py; a restricted account
    never passes for anything but a view permission, regardless of role).
    Use this instead of hardcoding a role set inline, so a Super Admin's
    matrix edit — or sandbox switch — actually takes effect everywhere that
    permission is checked."""

    async def _dependency(
        account: Account = Depends(require_account),
        db: AsyncSession = Depends(get_db),
        request: Request = None,  # type: ignore[assignment]
    ) -> Account:
        role = get_effective_role(account, request)
        if not await has_permission(db, account, permission, role=role):
            title = PERMISSION_LABELS[permission]["title"]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You don't have the '{title}' permission",
            )
        return account

    return _dependency


# Mirrors EMPLOYEE_WRITE_ROLES in src/lib/permissions.ts (kept as a name
# there for the frontend's own gating, though the source of truth for what
# it actually means now lives in the database, not a hardcoded role set).
require_employee_writer = require_permission(Permission.EMPLOYEES_MANAGE)

# Mirrors ONBOARDING_WRITE_ROLES in src/lib/permissions.ts. This is the broad
# "may touch the onboarding module at all" check — Recruitment Lead and
# Onboarding Specialist are further restricted to their own checklist fields
# by ROLE_FIELD_ACCESS in app/api/routes/new_hires.py (per the New Hire
# Onboarding Tracker SOP), which stays fixed in code regardless of what the
# matrix says — the matrix only decides whether a role reaches this far at all.
require_onboarding_writer = require_permission(Permission.ONBOARDING_MANAGE)

# Mirrors canManageBenefits in src/lib/permissions.ts.
require_benefits_writer = require_permission(Permission.BENEFITS_MANAGE)


async def require_violation_writer(
    account: Account = Depends(require_account),
    db: AsyncSession = Depends(get_db),
    request: Request = None,  # type: ignore[assignment]
) -> Account:
    """Create/edit/prepare/import a violation record — per the SOP's section
    17 ("Projects Team" builds/submits) and section 3's workflow (someone
    adds/updates the tracker row; that doesn't have to be HR itself). Gated
    on Permission.ATTENDANCE_MANAGE (matrix-configurable — HR and Projects
    both hold it by default); only HR can actually approve/send — see
    require_violation_approver below."""
    role = get_effective_role(account, request)
    if not await has_permission(db, account, Permission.ATTENDANCE_MANAGE, role=role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to modify attendance violation records",
        )
    return account


async def require_violation_approver(
    account: Account = Depends(require_account),
    db: AsyncSession = Depends(get_db),
    request: Request = None,  # type: ignore[assignment]
) -> Account:
    """Approve/hold/needs-correction/resend/send a violation record. The SOP
    is explicit (section 10): "The system must never send a newly prepared
    attendance violation email without an explicit HR approval status."
    Gated on Permission.ATTENDANCE_APPROVE (matrix-configurable — only HR
    holds it by default; Projects can prepare a record but never approve its
    own submission)."""
    role = get_effective_role(account, request)
    if not await has_permission(db, account, Permission.ATTENDANCE_APPROVE, role=role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to approve, hold, or send attendance violation records",
        )
    return account


# Same as require_admin — a distinct name (rather than routes depending on
# require_admin directly) just for symmetry with require_violation_writer/
# require_violation_approver above, so violations.py's three auth tiers read
# as one family of module-specific dependencies.
require_violation_admin = require_admin
