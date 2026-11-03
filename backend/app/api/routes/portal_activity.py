"""Live Onboarding & Offboarding Portal activity for the Dashboard - the feed
of what just happened over there, and current counts of what is open. Reads the
events app/services/portal_sync.py keeps up to date; never calls the portal
itself except for the explicit "sync now". Gated by Permission.PORTAL_ACTIVITY_VIEW.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.config import get_settings
from app.core.db import get_db
from app.models.permission import Permission
from app.models.portal_event import PortalEvent, PortalSyncState
from app.services.portal_sync import sync_once

router = APIRouter(
    prefix="/portal-activity",
    tags=["portal-activity"],
    dependencies=[Depends(require_permission(Permission.PORTAL_ACTIVITY_VIEW))],
)

DbSession = Annotated[AsyncSession, Depends(get_db)]

# Statuses that mean "still open", per dataset, for the Dashboard counts.
OPEN_FINAL_PAY = {"PENDING", "PROCESSING", "ON_HOLD"}
OUTSTANDING_ASSETS = {"ISSUED", "PENDING", "LOST", "DAMAGED"}


class PortalEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entity: str
    kind: str
    state: str
    title: str
    detail: str | None
    employee_name: str | None
    occurred_at: datetime


class PortalFeedPage(BaseModel):
    items: list[PortalEventRead]
    total: int


class PortalSummary(BaseModel):
    configured: bool
    # Newest successful poll across the datasets, and the first problem if any.
    last_synced_at: datetime | None
    error: str | None
    events_24h: int
    pending_exit_requests: int
    approved_exit_requests: int
    final_pay_open: int
    assets_outstanding: int
    new_hires_pending: int


@router.get("/feed", response_model=PortalFeedPage)
async def feed(
    db: DbSession,
    entity: str | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PortalFeedPage:
    conditions = [PortalEvent.entity == entity] if entity else []
    total = (await db.execute(select(func.count()).select_from(PortalEvent).where(*conditions))).scalar_one()
    rows = (
        (
            await db.execute(
                select(PortalEvent)
                .where(*conditions)
                .order_by(PortalEvent.occurred_at.desc(), PortalEvent.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return PortalFeedPage(items=list(rows), total=total)


@router.get("/summary", response_model=PortalSummary)
async def summary(db: DbSession) -> PortalSummary:
    # Each record's CURRENT status = its most recent event.
    latest = (
        select(PortalEvent.entity, PortalEvent.record_id, PortalEvent.state)
        .distinct(PortalEvent.entity, PortalEvent.record_id)
        .order_by(
            PortalEvent.entity,
            PortalEvent.record_id,
            PortalEvent.occurred_at.desc(),
            PortalEvent.id.desc(),
        )
        .subquery()
    )
    rows = (
        await db.execute(select(latest.c.entity, latest.c.state, func.count()).group_by(latest.c.entity, latest.c.state))
    ).all()
    counts: dict[tuple[str, str], int] = {(entity, state): n for entity, state, n in rows}

    def total(entity: str, states: set[str]) -> int:
        return sum(n for (e, s), n in counts.items() if e == entity and s in states)

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    events_24h = (
        await db.execute(select(func.count()).select_from(PortalEvent).where(PortalEvent.occurred_at >= since))
    ).scalar_one()

    states = (await db.execute(select(PortalSyncState))).scalars().all()
    synced = [s.last_synced_at for s in states if s.last_synced_at]
    errors = [s.last_error for s in states if s.last_error]

    return PortalSummary(
        configured=get_settings().onboarding_portal_configured,
        last_synced_at=max(synced) if synced else None,
        error=errors[0] if errors else None,
        events_24h=events_24h,
        pending_exit_requests=total("exit_request", {"PENDING"}),
        approved_exit_requests=total("exit_request", {"APPROVED"}),
        final_pay_open=total("final_pay", OPEN_FINAL_PAY),
        assets_outstanding=total("asset_return", OUTSTANDING_ASSETS),
        new_hires_pending=total("new_hire", {"PENDING", "IN_PROGRESS"}),
    )


@router.post("/sync", response_model=PortalSummary)
async def sync_now(db: DbSession) -> PortalSummary:
    """Poll the portal right now instead of waiting for the next cycle."""
    await sync_once()
    return await summary(db)

