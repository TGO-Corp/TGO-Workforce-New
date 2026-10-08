"""Zoho OAuth login.

/auth/zoho/login   redirects the browser to Zoho to start the flow.
/auth/zoho/callback is where Zoho sends the browser back once the person
                     approves — this exchanges the code, upserts the Account
                     row (matched on Zoho's stable ZUID), and sets the session
                     cookie. A brand-new account's role comes from a matching
                     PendingInvite (see app/models/pending_invite.py) if an
                     admin registered one via POST /accounts/invites, or the
                     usual VIEWER default otherwise — unless invite-only
                     sign-in is on (see app/models/app_settings.py), in which
                     case a brand-new account with no invite is rejected.
/auth/me           tells the frontend who (if anyone) is currently signed in.
/auth/me/preferences lets that same person update their own personalization
                     (theme, default office, notification toggles) — see
                     AccountPreferencesUpdate. Nothing here needs admin rights;
                     it's always "change my own preferences", never someone
                     else's (that's PATCH /accounts/{id}, admin-only).
/auth/sandbox/enter and /exit let a genuine Super Admin temporarily act as one
                     of the six matrix-configurable roles — a *live* switch
                     (see app/core/auth.py's get_effective_role), not just a
                     UI preview, so they can actually prove the permission
                     matrix works end to end.
/auth/logout       clears the session cookie.
/auth/status       which sign-in this deployment uses (Zoho, or the TGO Gateway
                     once GATEWAY_URL is set) and, for the Gateway, where the
                     caller stands: the login page reads it to redirect to the
                     Gateway or explain a denial instead of looping.
"""

import asyncio
import secrets
import uuid
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import gateway
from app.core.auth import (
    AUTH_METHOD_PASSWORD,
    AUTH_METHOD_SESSION_KEY,
    GATEWAY_STATUS_DETAIL,
    SANDBOX_SESSION_KEY,
    get_current_account,
    get_effective_role,
    require_account,
    resolve_gateway_account,
)
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.models.account import Account, AccountRole
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.models.pending_invite import PendingInvite
from app.models.session import AccountSession
from app.schemas.account import (
    AccountPreferencesUpdate,
    AccountRead,
    SandboxRoleRequest,
    SignInStatusRead,
)
from app.services import login_throttle, zoho
from app.services.activity_log import record_activity
from app.services.app_settings import get_app_settings
from app.services.passwords import hash_password, verify_password
from app.services.permissions import MATRIX_ROLES, get_account_permissions
from app.services.session_info import (
    get_client_ip,
    lookup_location_label,
    module_for_path,
    parse_device_label,
)

router = APIRouter(prefix="/auth", tags=["auth"])


async def _account_read(db: AsyncSession, account: Account, request: Request) -> AccountRead:
    """Shared builder for every response that hands the signed-in caller back
    their own account — /auth/me, /auth/me/preferences, and both sandbox
    endpoints. Computes `permissions` from the *effective* role (real role,
    unless a Super Admin has an active sandbox override) and surfaces that
    override as `sandbox_role` so the frontend can bannner it, while `role`
    itself always stays the real persisted value."""
    role = get_effective_role(account, request)
    permissions = await get_account_permissions(db, account, role=role)
    account_read = AccountRead.model_validate(account)
    account_read.permissions = sorted(permissions, key=lambda p: p.value)
    account_read.sandbox_role = role if role != account.role else None
    return account_read


@router.get("/status", response_model=SignInStatusRead)
async def sign_in_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SignInStatusRead:
    if not settings.gateway_enabled:
        return SignInStatusRead(mode="zoho")
    sign_in = await resolve_gateway_account(request, db, settings)
    return SignInStatusRead(
        mode="gateway",
        status=sign_in.status,
        detail=GATEWAY_STATUS_DETAIL.get(sign_in.status),
        login_url=gateway.login_url(settings, f"{settings.frontend_url.rstrip('/')}/"),
        logout_url=gateway.logout_url(settings),
        email=sign_in.email,
    )


@router.get("/zoho/login")
async def zoho_login(request: Request, settings: Settings = Depends(get_settings)):
    # With the Gateway in front, it is the only way in: an old bookmark or
    # button pointing here goes to the Gateway login instead.
    if settings.gateway_enabled:
        return RedirectResponse(
            gateway.login_url(settings, f"{settings.frontend_url.rstrip('/')}/")
        )
    if not settings.zoho_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Zoho sign-in isn't configured yet.",
        )
    # CSRF guard: a random value only this server could have set, checked
    # again against whatever Zoho hands back to the callback below.
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    return RedirectResponse(zoho.build_authorize_url(settings, state))


async def _log_login_attempt(
    db: AsyncSession,
    *,
    success: bool,
    action: str,
    account: Account | None = None,
    actor_label: str | None = None,
    ip_address: str | None = None,
) -> None:
    """Every sign-in attempt, success or failure, lands in the same shared
    Activity Log (category=ACCESS) the rest of the app already uses — see
    CATEGORY_PERMISSION in app/services/permissions.py, which keeps this
    category admin/super-admin-only regardless of the matrix. No separate
    login-log table/page; the existing Activity Logs page's category/severity
    filters already cover "who signed in, and did it succeed" once these rows
    exist."""
    await record_activity(
        db,
        action=action,
        category=ActivityCategory.ACCESS,
        account=account,
        # A failed attempt is attributed to the EMAIL that was used (not the
        # account's display name) so an admin reviewing the log sees exactly
        # which address tried to get in. Successful sign-ins keep the usual
        # display-name actor.
        actor_label=(
            account.email
            if account is not None and not success
            else (actor_label if account is None else None)
        ),
        severity=ActivitySeverity.INFO if success else ActivitySeverity.WARNING,
        details={"ip_address": ip_address} if ip_address else None,
        commit=True,
    )


@router.get("/zoho/callback")
async def zoho_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if settings.gateway_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    expected_state = request.session.pop("oauth_state", None)
    failure_redirect = f"{settings.frontend_url}/login?error=zoho"
    client_ip = get_client_ip(request)

    if error or not code or not state or state != expected_state:
        await _log_login_attempt(
            db,
            success=False,
            action=(
                f"Sign-in failed: Zoho returned an error ({error})"
                if error
                else "Sign-in failed: invalid or expired sign-in state"
            ),
            # Zoho never told us who this was — the email is simply not known
            # at this point of the flow.
            actor_label="Unknown (no email available)",
            ip_address=client_ip,
        )
        return RedirectResponse(failure_redirect)

    try:
        token_payload = await zoho.exchange_code_for_token(settings, code)
        profile = await zoho.fetch_user_info(token_payload["access_token"])
    except (httpx.HTTPError, zoho.ZohoAuthError, KeyError):
        await _log_login_attempt(
            db,
            success=False,
            action="Sign-in failed: couldn't complete the Zoho OAuth exchange",
            actor_label="Unknown (no email available)",
            ip_address=client_ip,
        )
        return RedirectResponse(failure_redirect)

    zuid = str(profile.get("ZUID") or "")
    email = profile.get("Email")
    if not zuid or not email:
        await _log_login_attempt(
            db,
            success=False,
            action="Sign-in failed: Zoho profile missing ZUID or email",
            actor_label=email or "Unknown (no email available)",
            ip_address=client_ip,
        )
        return RedirectResponse(failure_redirect)

    result = await db.execute(select(Account).where(Account.zoho_user_id == zuid))
    account = result.scalar_one_or_none()

    now = datetime.now(UTC)
    if account is None:
        # First-ever sign-in for this person. There's no public "create
        # account" endpoint on purpose — this upsert-on-login is the only way
        # a row in accounts ever gets created — but an admin can pre-assign a
        # role for this email via POST /accounts/invites before they ever
        # sign in (see app/models/pending_invite.py); consume that here if
        # one's waiting, otherwise fall back to the usual VIEWER default.
        invite_result = await db.execute(
            select(PendingInvite).where(PendingInvite.email == email.lower())
        )
        pending_invite = invite_result.scalar_one_or_none()

        # A Super Admin can lock the portal down to invited emails only (see
        # app/models/app_settings.py) — the standing admin allowlist still
        # bootstraps in regardless, since that's the one way in without any
        # database access at all if every invite were somehow lost.
        if pending_invite is None and email.lower() not in settings.admin_email_set:
            app_settings = await get_app_settings(db)
            if app_settings.invite_only_signup:
                await db.commit()  # persist the get-or-create'd settings row, if it was just created
                await _log_login_attempt(
                    db,
                    success=False,
                    action="Sign-in rejected: invite required",
                    actor_label=email,
                    ip_address=client_ip,
                )
                return RedirectResponse(f"{settings.frontend_url}/login?error=invite_only")

        account = Account(
            zoho_user_id=zuid,
            email=email,
            first_name=profile.get("First_Name"),
            last_name=profile.get("Last_Name"),
            display_name=profile.get("Display_Name"),
            role=pending_invite.role if pending_invite else AccountRole.VIEWER,
            last_login_at=now,
        )
        db.add(account)
        if pending_invite is not None:
            await db.delete(pending_invite)
    else:
        account.email = email
        account.first_name = profile.get("First_Name")
        account.last_name = profile.get("Last_Name")
        # display_name is deliberately NOT re-synced here — Zoho's profile
        # only *seeds* it once, on first-ever sign-in (the `if account is
        # None` branch above). Once someone's account exists, display_name
        # is theirs to customize (see PATCH /auth/me/preferences and the
        # Profile page) — re-syncing it on every login would silently
        # overwrite that self-edit the next time they signed in.
        account.last_login_at = now

    # Bootstrap / standing admin allowlist — see Settings.zoho_admin_emails.
    # Applied on every login (not just account creation) so adding an email
    # to the list and having that person sign in again is enough to promote
    # them, with no database access required.
    if email.lower() in settings.admin_email_set:
        account.role = AccountRole.ADMIN

    await db.commit()
    await db.refresh(account)

    if not account.is_active:
        await _log_login_attempt(
            db,
            success=False,
            action="Sign-in rejected: account inactive",
            account=account,
            ip_address=client_ip,
        )
        return RedirectResponse(f"{settings.frontend_url}/login?error=inactive")

    # Server-side session row (see app/models/session.py) — its id, not just
    # the account id, now goes into the cookie, so a Super Admin can later
    # revoke exactly this browser's session (POST
    # /accounts/sessions/{id}/terminate) without touching anyone else's.
    user_agent = request.headers.get("user-agent")
    account_session = AccountSession(
        id=uuid.uuid4(),
        account_id=account.id,
        ip_address=client_ip,
        device_label=parse_device_label(user_agent),
        location_label=await lookup_location_label(client_ip),
    )
    db.add(account_session)
    await db.commit()

    request.session["account_id"] = str(account.id)
    request.session["session_id"] = str(account_session.id)

    await _log_login_attempt(
        db,
        success=True,
        action="Signed in",
        account=account,
        ip_address=client_ip,
    )
    return RedirectResponse(settings.frontend_url)


@router.get("/me", response_model=AccountRead | None)
async def me(
    request: Request,
    account: Account | None = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
):
    if account is None:
        return None
    return await _account_read(db, account, request)


class PasswordLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


# Verified against when the email is unknown (or has no password), so a wrong
# email and a wrong password take the same time and can't be told apart.
_dummy_hash: str | None = None


def _get_dummy_hash() -> str:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_urlsafe(12))
    return _dummy_hash


@router.post("/login", response_model=AccountRead)
async def password_login(
    payload: PasswordLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccountRead:
    """Email + password fallback sign-in — works whether Zoho or the Gateway is
    in front, so someone can still get in when SSO is down or misconfigured.
    Only accounts with a password_hash can use it (the seeded fallback admin,
    see app/services/fallback_admin.py). Failed attempts are throttled per
    email and per IP, never reveal whether the email exists, and are recorded
    in the Activity Log under the email that was tried."""
    if not settings.password_login_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    email = payload.email.strip().lower()
    client_ip = get_client_ip(request)

    wait = login_throttle.retry_after_seconds(email, client_ip)
    if wait:
        minutes = max(1, round(wait / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in about {minutes} minute(s).",
            headers={"Retry-After": str(wait)},
        )

    result = await db.execute(select(Account).where(func.lower(Account.email) == email))
    account = result.scalar_one_or_none()
    stored_hash = account.password_hash if account else None
    password_ok = await asyncio.to_thread(
        verify_password, payload.password, stored_hash or _get_dummy_hash()
    )

    if not (password_ok and stored_hash and account is not None and account.is_active):
        login_throttle.record_failure(email, client_ip)
        reason = (
            "account inactive"
            if password_ok and stored_hash and account is not None and not account.is_active
            else "wrong email or password"
        )
        await _log_login_attempt(
            db,
            success=False,
            action=f"Sign-in failed (email & password): {reason}",
            actor_label=email,
            ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password."
        )

    login_throttle.clear_email(email)
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
    await db.refresh(account)

    request.session.pop(SANDBOX_SESSION_KEY, None)
    request.session["account_id"] = str(account.id)
    request.session["session_id"] = str(account_session.id)
    request.session[AUTH_METHOD_SESSION_KEY] = AUTH_METHOD_PASSWORD

    await _log_login_attempt(
        db,
        success=True,
        action="Signed in with email & password",
        account=account,
        ip_address=client_ip,
    )
    return await _account_read(db, account, request)


class PresenceReport(BaseModel):
    """Which page this browser just opened — see POST /auth/me/presence."""

    path: str = Field(max_length=200)


@router.post("/me/presence", status_code=status.HTTP_204_NO_CONTENT)
async def report_presence(
    payload: PresenceReport,
    request: Request,
    account: Account = Depends(require_account),
    db: AsyncSession = Depends(get_db),
) -> None:
    """The app calls this on every page change so the Super Admin's Active
    Sessions panel can show which module each person is in (or was last in).
    Best-effort and silent: a cookie from before session tracking existed has
    no session id (nothing to update), and any non-page path is ignored."""
    raw_session_id = request.session.get("session_id")
    module = module_for_path(payload.path)
    if not raw_session_id or module is None:
        return
    try:
        session_id = uuid.UUID(raw_session_id)
    except ValueError:
        return
    account_session = await db.get(AccountSession, session_id)
    if (
        account_session is None
        or account_session.account_id != account.id
        or account_session.revoked_at is not None
    ):
        return
    now = datetime.now(UTC)
    if account_session.current_module != module:
        account_session.current_module = module
        account_session.module_changed_at = now
    account_session.last_seen_at = now
    await db.commit()


@router.patch("/me/preferences", response_model=AccountRead)
async def update_my_preferences(
    payload: AccountPreferencesUpdate,
    request: Request,
    account: Account = Depends(require_account),
    db: AsyncSession = Depends(get_db),
) -> AccountRead:
    """Backs the Profile and Settings pages' personalization controls (theme,
    default office, notification toggles). Deliberately not routed through
    the admin-only /accounts router — anyone signed in can change their own
    preferences, same as they could always toggle their own theme."""
    changes = payload.model_dump(exclude_unset=True)
    # Saved filters are merged page by page into what's already stored.
    incoming_filters = changes.pop("saved_filters", None)
    for field, value in changes.items():
        setattr(account, field, value)
    if incoming_filters:
        merged = dict(account.saved_filters or {})
        for page, prefs in incoming_filters.items():
            if prefs is not None:
                merged[page] = prefs
        # Reassigned (not mutated in place) so SQLAlchemy sees the change.
        account.saved_filters = merged
        changes["saved_filters"] = merged
    if changes:
        await db.commit()
        await db.refresh(account)
    return await _account_read(db, account, request)


@router.post("/sandbox/enter", response_model=AccountRead)
async def enter_sandbox(
    payload: SandboxRoleRequest,
    request: Request,
    account: Account = Depends(require_account),
    db: AsyncSession = Depends(get_db),
) -> AccountRead:
    """Temporarily switches the caller's *effective* role for this session to
    one of the six matrix-configurable roles — every permission check from
    here on (nav, pages, every write endpoint) enforces exactly what that
    role can do, until /auth/sandbox/exit is called. Deliberately checks the
    real account.role directly rather than going through require_super_admin
    (which would use the *effective* role) — a Super Admin sandboxing as
    Viewer must still be able to reach this endpoint's sibling, /exit, to get
    back."""
    if account.role != AccountRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only a Super Admin can sandbox a role")
    if payload.role not in MATRIX_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only sandbox one of the configurable roles",
        )
    request.session[SANDBOX_SESSION_KEY] = payload.role.value
    await record_activity(
        db,
        action=f"Entered sandbox as {payload.role.value}",
        category=ActivityCategory.ACCESS,
        account=account,
        severity=ActivitySeverity.WARNING,
        commit=True,
    )
    return await _account_read(db, account, request)


@router.post("/sandbox/exit", response_model=AccountRead)
async def exit_sandbox(
    request: Request,
    account: Account = Depends(require_account),
    db: AsyncSession = Depends(get_db),
) -> AccountRead:
    had_sandbox = request.session.pop(SANDBOX_SESSION_KEY, None)
    if had_sandbox:
        await record_activity(
            db,
            action="Exited sandbox",
            category=ActivityCategory.ACCESS,
            account=account,
            severity=ActivitySeverity.INFO,
            commit=True,
        )
    return await _account_read(db, account, request)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, db: AsyncSession = Depends(get_db)) -> None:
    raw_session_id = request.session.get("session_id")
    if raw_session_id:
        try:
            session_id = uuid.UUID(raw_session_id)
        except ValueError:
            session_id = None
        if session_id is not None:
            account_session = await db.get(AccountSession, session_id)
            if account_session is not None and account_session.revoked_at is None:
                account_session.revoked_at = datetime.now(UTC)
                await db.commit()
    request.session.clear()
