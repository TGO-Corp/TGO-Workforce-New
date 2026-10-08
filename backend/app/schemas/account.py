import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.account import AccountRole
from app.models.permission import Permission

Theme = Literal["light", "dark"]


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    zoho_user_id: str
    email: EmailStr
    first_name: str | None
    last_name: str | None
    display_name: str | None
    photo_url: str | None
    role: AccountRole
    is_active: bool
    is_restricted: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    theme: Theme
    default_office: str | None
    notify_anniversaries: bool
    notify_birthdays: bool
    notify_new_hires: bool
    notify_on_violation_review: bool
    notify_on_new_hire_added: bool
    notify_on_hmo_member_added: bool
    animations_enabled: bool
    show_intro: bool
    # Not a mapped column — populated by the /auth/me route (and anywhere else
    # that returns AccountRead for "the signed-in caller") via
    # get_account_permissions(). The frontend uses this instead of hardcoding
    # role checks, so it stays correct as Super Admin edits the matrix without
    # a frontend redeploy. Not populated on rows returned by admin-only list/
    # detail endpoints (e.g. GET /accounts) — those never set this attribute,
    # so it comes back as an empty list; something worth revisiting if the
    # frontend ever needs another *account's* permissions, not just its own.
    permissions: list[Permission] = []
    # Non-null only on the signed-in caller's own /auth/me (and /auth/sandbox/*)
    # response, and only for a genuine Super Admin with an active sandbox —
    # see app/core/auth.py's get_effective_role. `role` above always stays the
    # real persisted role; this is what's actually being enforced right now.
    sandbox_role: AccountRole | None = None


class AccountUpdate(BaseModel):
    """Admin-editable fields — everything else (identity, Zoho linkage) is only
    ever set by the login flow itself."""

    display_name: str | None = None
    photo_url: str | None = None
    role: AccountRole | None = None
    is_active: bool | None = None
    is_restricted: bool | None = None


class AccountPreferencesUpdate(BaseModel):
    """Self-service personalization — backs PATCH /auth/me/preferences. Every
    field optional so a save only touches what actually changed, same pattern
    as EmployeeUpdate. Deliberately excludes role/is_active: those stay
    admin-only (AccountUpdate). display_name/photo_url used to be excluded
    too ("Zoho-sourced") but are self-editable here now (2026-09-09) — see
    the login callback in app/api/routes/auth.py, which only *seeds* these
    two from Zoho's profile on first-ever sign-in and never overwrites them
    again afterward, so a self-edit here sticks across future logins.
    photo_url is either a pasted image URL or a data: URI from the Profile
    page's file upload (downsized client-side first) — there's no object
    storage wired up in this app, so an uploaded file is stored inline
    instead of in a bucket (see the comment on Account.photo_url)."""

    display_name: str | None = None
    photo_url: str | None = None
    theme: Theme | None = None
    default_office: str | None = None
    notify_anniversaries: bool | None = None
    notify_birthdays: bool | None = None
    notify_new_hires: bool | None = None
    notify_on_violation_review: bool | None = None
    notify_on_new_hire_added: bool | None = None
    notify_on_hmo_member_added: bool | None = None
    animations_enabled: bool | None = None
    show_intro: bool | None = None


class SandboxRoleRequest(BaseModel):
    """Backs POST /auth/sandbox/enter — the role a Super Admin wants to
    temporarily act as. Restricted to the six matrix-configurable roles at
    the route level (sandboxing as Admin/Super Admin would be a no-op)."""

    role: AccountRole


class SignInStatusRead(BaseModel):
    """GET /auth/status. `mode` is "zoho" until GATEWAY_URL is set; in
    "gateway" mode `status` is one of GatewaySignInStatus in app/core/auth.py
    and the two URLs are where the login page sends the browser."""

    mode: Literal["zoho", "gateway"]
    status: str | None = None
    detail: str | None = None
    login_url: str | None = None
    logout_url: str | None = None
    # Only for status "denied": the Gateway account that was turned away.
    email: str | None = None
