import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_effective_role, require_account
from app.core.db import get_db
from app.models.account import Account
from app.models.activity_log import ActivityCategory, ActivityLog, ActivitySeverity
from app.models.permission import Permission
from app.schemas.activity_log import ActivityLogPage, ActivityLogRead, ActivityLogSummary
from app.services.permissions import has_permission, visible_activity_categories

# Requires a signed-in account — this used to be reachable by anyone.
router = APIRouter(
    prefix="/activity-logs", tags=["activity-logs"], dependencies=[Depends(require_account)]
)


@router.get("", response_model=list[ActivityLogRead])
async def list_activity_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    account: Annotated[Account, Depends(require_account)],
    category: ActivityCategory | None = None,
    severity: ActivitySeverity | None = None,
    # Exact match on the free-text target column — used by the HMO member
    # profile page's Activity History panel (target = the member's id).
    target: str | None = None,
    # Backs the Profile page's "My Activity" section — pass the signed-in
    # account's own id to see only their rows.
    account_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ActivityLog]:
    # Module-siloed, same as everywhere else in the app: an HR account only
    # sees Attendance (+ Employee) rows, a Recruitment Lead only sees
    # Onboarding (+ Employee), and the admin-only Access/Data/System
    # categories stay admin/super_admin-only (and unrestricted) — see
    # visible_activity_categories in app/services/permissions.py.
    role = get_effective_role(account, request)
    # The log itself needs Permission.ACTIVITY_LOGS_VIEW — except an account
    # reading back its own rows (Profile page's "My Activity"), which is
    # never anyone else's data.
    is_own_rows = account_id is not None and account_id == account.id
    if not is_own_rows and not await has_permission(
        db, account, Permission.ACTIVITY_LOGS_VIEW, role=role
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission to view activity logs.")
    visible = await visible_activity_categories(db, account, role=role)

    stmt = select(ActivityLog).where(ActivityLog.category.in_(visible)).order_by(ActivityLog.created_at.desc())
    if category is not None:
        # A category outside what this account can see isn't an error —
        # just an empty result, so this doesn't leak whether the category
        # itself exists to someone who can't view it.
        if category not in visible:
            return []
        stmt = stmt.where(ActivityLog.category == category)
    if severity is not None:
        stmt = stmt.where(ActivityLog.severity == severity)
    if account_id is not None:
        stmt = stmt.where(ActivityLog.account_id == account_id)
    if target is not None:
        stmt = stmt.where(ActivityLog.target == target)
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/page", response_model=ActivityLogPage)
async def list_activity_logs_page(
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
    account: Annotated[Account, Depends(require_account)],
    category: ActivityCategory | None = None,
    severity: ActivitySeverity | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    since: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 15,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ActivityLogPage:
    """Backs the Activity Logs page: search, module, severity and time-range
    filtering plus paging all happen in the database, so the audit trail can grow
    without the page ever loading it all (the older GET "" below returns one
    unfiltered batch and stays for the small per-person / per-member panels).

    Same visibility rules as GET "": the caller needs ACTIVITY_LOGS_VIEW, and
    only sees the categories their permissions cover."""
    role = get_effective_role(account, request)
    if not await has_permission(db, account, Permission.ACTIVITY_LOGS_VIEW, role=role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have permission to view activity logs.")
    visible = await visible_activity_categories(db, account, role=role)

    # Everything the caller may see — the base for the summary cards.
    scope = [ActivityLog.category.in_(visible)]

    filters = list(scope)
    if category is not None:
        # A category outside what the caller can see is just an empty result.
        filters.append(ActivityLog.category == category)
    if severity is not None:
        filters.append(ActivityLog.severity == severity)
    if since is not None:
        filters.append(ActivityLog.created_at >= since)
    if q and q.strip():
        needle = q.strip()
        like = f"%{needle}%"
        clauses = [
            ActivityLog.actor_label.ilike(like),
            ActivityLog.action.ilike(like),
            ActivityLog.target.ilike(like),
        ]
        # The page shows ids as "LOG-123"; let that (or a bare number) match too.
        id_text = needle.upper().removeprefix("LOG-")
        if id_text.isdigit() and len(id_text) <= 18:
            clauses.append(ActivityLog.id == int(id_text))
        filters.append(or_(*clauses))

    total = (
        await db.execute(select(func.count()).select_from(ActivityLog).where(*filters))
    ).scalar_one()

    rows = (
        await db.execute(
            select(ActivityLog)
            .where(*filters)
            # id breaks ties so rows never repeat or vanish between pages.
            .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()

    by_severity = dict(
        (
            await db.execute(
                select(ActivityLog.severity, func.count())
                .where(*scope)
                .group_by(ActivityLog.severity)
            )
        ).all()
    )

    def count_of(level: ActivitySeverity) -> int:
        return int(by_severity.get(level, 0))

    return ActivityLogPage(
        items=[ActivityLogRead.model_validate(row) for row in rows],
        total=total,
        summary=ActivityLogSummary(
            total=sum(int(n) for n in by_severity.values()),
            critical=count_of(ActivitySeverity.CRITICAL),
            warning=count_of(ActivitySeverity.WARNING),
            info=count_of(ActivitySeverity.INFO),
        ),
    )
