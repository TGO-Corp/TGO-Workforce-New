"""The signed-in account's own notification inbox — backs the nav bell icon
and its dropdown. Always scoped to the caller (there's no "list anyone's
notifications" route, admin or otherwise — a notification is only ever
meaningful to the account it was created for).
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_effective_role, require_account
from app.core.db import get_db
from app.models.account import Account
from app.models.notification import Notification
from app.schemas.notification import DeletedCount, NotificationPage, NotificationRead, UnreadCount
from app.services.permissions import get_account_permissions

router = APIRouter(prefix="/notifications", tags=["notifications"], dependencies=[Depends(require_account)])

CurrentAccount = Annotated[Account, Depends(require_account)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


async def _visible_notifications_filter(db: AsyncSession, account: Account, request: Request):
    """A notification created for a permission the account no longer holds
    (a Super Admin revoked it from the matrix since, or the account is now
    restricted/sandboxed) stops showing up — re-checked live on every read,
    not just at creation time. A notification with no required_permission
    (see app/services/notify.py's notify_account) always shows."""
    role = get_effective_role(account, request)
    permissions = await get_account_permissions(db, account, role=role)
    return or_(Notification.required_permission.is_(None), Notification.required_permission.in_(permissions))


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    account: CurrentAccount,
    db: DbSession,
    request: Request,
    unread_only: bool = False,
    limit: Annotated[int, Query(le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Notification]:
    stmt = select(Notification).where(
        Notification.account_id == account.id, await _visible_notifications_filter(db, account, request)
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/page", response_model=NotificationPage)
async def list_notifications_page(
    account: CurrentAccount,
    db: DbSession,
    request: Request,
    unread_only: bool = False,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NotificationPage:
    """Backs the sidebar Notifications module: search, an unread-only filter and
    paging done in the database. The bell's dropdown keeps using the plain list
    above. Same scoping rules: only the caller's own rows, and only those still
    covered by a permission they currently hold."""
    mine = [Notification.account_id == account.id, await _visible_notifications_filter(db, account, request)]
    filters = list(mine)
    if unread_only:
        filters.append(Notification.is_read.is_(False))
    if q and q.strip():
        like = f"%{q.strip()}%"
        filters.append(or_(Notification.title.ilike(like), Notification.body.ilike(like)))

    total = (await db.execute(select(func.count()).select_from(Notification).where(*filters))).scalar_one()
    unread = (
        await db.execute(
            select(func.count()).select_from(Notification).where(*mine, Notification.is_read.is_(False))
        )
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(Notification)
                .where(*filters)
                # id breaks created_at ties so rows never repeat or vanish between pages.
                .order_by(Notification.created_at.desc(), Notification.id.desc())
                .offset(offset)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return NotificationPage(items=[NotificationRead.model_validate(r) for r in rows], total=total, unread=unread)


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(account: CurrentAccount, db: DbSession, request: Request) -> UnreadCount:
    """Lightweight poll target for the bell's badge — just a count, not the
    full list, so polling this every 15s doesn't refetch the whole inbox."""
    stmt = select(func.count()).select_from(Notification).where(
        Notification.account_id == account.id,
        Notification.is_read.is_(False),
        await _visible_notifications_filter(db, account, request),
    )
    count = (await db.execute(stmt)).scalar_one()
    return UnreadCount(count=count)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(notification_id: int, account: CurrentAccount, db: DbSession) -> Notification:
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.account_id != account.id:
        # Same 404 either way — a notification that isn't yours shouldn't
        # even confirm it exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(account: CurrentAccount, db: DbSession) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.account_id == account.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()


@router.post("/{notification_id}/unread", response_model=NotificationRead)
async def mark_unread(notification_id: int, account: CurrentAccount, db: DbSession) -> Notification:
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.is_read = False
    await db.commit()
    await db.refresh(notification)
    return notification


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(notification_id: int, account: CurrentAccount, db: DbSession) -> None:
    """Dismisses one notification for good. A notification is a private inbox
    item — deleting it removes nothing from the audit trail (Activity Logs)."""
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.account_id != account.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await db.delete(notification)
    await db.commit()


@router.delete("", response_model=DeletedCount)
async def clear_notifications(
    account: CurrentAccount,
    db: DbSession,
    scope: Literal["read", "all"],
) -> DeletedCount:
    """Clears the caller's inbox: `scope=read` removes only what they've already
    read, `scope=all` removes everything. `scope` is required on purpose, so a
    bare DELETE can never wipe an inbox by accident."""
    stmt = delete(Notification).where(Notification.account_id == account.id)
    if scope == "read":
        stmt = stmt.where(Notification.is_read.is_(True))
    result = await db.execute(stmt)
    await db.commit()
    return DeletedCount(deleted=result.rowcount or 0)
