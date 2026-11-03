"""Shared helper for creating in-app notifications. Call this from any
endpoint whose action other people should hear about — the same spirit as
app/services/activity_log.py's record_activity(), but for a personal,
dismissable inbox rather than a permanent audit trail. The two are often
called together for the same event (one row per recipient here, one shared
row there); they are not a replacement for each other.
"""

import uuid

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.notification import Notification
from app.models.permission import Permission, RolePermission
from app.services.permissions import FULL_ACCESS_ROLES, VIEW_PERMISSIONS


async def notify_account(
    db: AsyncSession,
    *,
    account_id: uuid.UUID,
    title: str,
    body: str | None = None,
    link: str | None = None,
    commit: bool = True,
) -> Notification:
    entry = Notification(account_id=account_id, title=title, body=body, link=link)
    db.add(entry)
    await db.flush()
    if commit:
        await db.commit()
        await db.refresh(entry)
    return entry


async def notify_permission_holders(
    db: AsyncSession,
    permission: Permission,
    *,
    title: str,
    body: str | None = None,
    link: str | None = None,
    exclude_account_id: uuid.UUID | None = None,
    require_preference: ColumnElement[bool] | None = None,
    source: str | None = None,
    commit: bool = True,
) -> list[Notification]:
    """Notifies every active account that currently holds `permission` — e.g.
    everyone with Permission.ATTENDANCE_APPROVE when a violation needs
    review. Admin/Super Admin always qualify (they bypass the permission
    matrix); which of the other six roles also qualify is looked up fresh
    from role_permissions on every call, so editing the matrix immediately
    changes who gets notified about future events — no code change needed.

    `exclude_account_id` skips the acting account itself, so the person who
    just did the thing that triggered this doesn't also get notified about
    their own action. `require_preference` additionally filters to accounts
    where that column is true — e.g. pass Account.notify_on_violation_review
    so someone who turned that off on the Settings page doesn't get this
    notification even though their role would otherwise qualify."""
    granted_roles = await db.execute(
        select(RolePermission.role).where(RolePermission.permission == permission)
    )
    target_roles = set(granted_roles.scalars().all()) | FULL_ACCESS_ROLES

    stmt = select(Account.id).where(Account.role.in_(list(target_roles)), Account.is_active.is_(True))
    if permission not in VIEW_PERMISSIONS:
        # A restricted account (Account.is_restricted) never actually holds
        # a manage/approve permission regardless of role (see
        # get_account_permissions) — notifying it about something it can no
        # longer act on ("ready for your approval") would just be noise, so
        # it's excluded from any notification gated on such a permission.
        stmt = stmt.where(Account.is_restricted.is_(False))
    if exclude_account_id is not None:
        stmt = stmt.where(Account.id != exclude_account_id)
    if require_preference is not None:
        stmt = stmt.where(require_preference.is_(True))
    result = await db.execute(stmt)
    account_ids = list(result.scalars().all())

    entries = [
        Notification(
            account_id=account_id,
            title=title,
            body=body,
            link=link,
            required_permission=permission,
            source=source,
        )
        for account_id in account_ids
    ]
    db.add_all(entries)
    await db.flush()
    if commit:
        await db.commit()
        for entry in entries:
            await db.refresh(entry)
    return entries
