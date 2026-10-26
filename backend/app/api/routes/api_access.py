"""API Access - Super Admin-only management of the keys (and the request
log) behind the read-only public API in app/api/routes/public_api.py. Stricter
than most admin modules for the same reason Database Backups is: a key is a
standing credential for employee data, so only a Super Admin hands them out.
Not in the permission matrix - like Backups, it isn't something a role can be
granted."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.core.db import get_db
from app.models.account import Account
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.models.api_key import ApiKey, ApiRequestLog
from app.schemas.api_access import (
    ApiCount,
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyRead,
    ApiRequestPage,
    ApiSeriesPoint,
    ApiStats,
)
from app.services.activity_log import record_activity
from app.services.api_keys import API_SCOPES, generate_key

router = APIRouter(prefix="/api-access", tags=["api-access"], dependencies=[Depends(require_super_admin)])

DbSession = Annotated[AsyncSession, Depends(get_db)]
SuperAdmin = Annotated[Account, Depends(require_super_admin)]

ALLOWED_HOURS = (24, 168, 720)


def _label(account: Account) -> str:
    return (
        account.display_name
        or f"{account.first_name or ''} {account.last_name or ''}".strip()
        or account.email
    )


@router.get("/scopes", response_model=list[str])
async def list_scopes() -> list[str]:
    return list(API_SCOPES)


@router.get("/keys", response_model=list[ApiKeyRead])
async def list_keys(db: DbSession) -> list[ApiKey]:
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    return list(result.scalars().all())


@router.post("/keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(payload: ApiKeyCreate, db: DbSession, account: SuperAdmin) -> ApiKeyCreated:
    scopes = sorted(set(payload.scopes))
    unknown = [s for s in scopes if s not in API_SCOPES]
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown scope: {unknown[0]}")
    token, prefix, digest = generate_key()
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)
        if payload.expires_in_days
        else None
    )
    key = ApiKey(
        name=payload.name.strip(),
        key_prefix=prefix,
        key_hash=digest,
        scopes=scopes,
        created_by_id=account.id,
        created_by_label=_label(account),
        expires_at=expires_at,
    )
    db.add(key)
    await record_activity(
        db,
        action="Created an API key",
        category=ActivityCategory.SYSTEM,
        account=account,
        target=key.name,
        details={"scopes": scopes, "expires_at": expires_at.isoformat() if expires_at else None},
        commit=False,
    )
    await db.commit()
    await db.refresh(key)
    return ApiKeyCreated(**ApiKeyRead.model_validate(key).model_dump(), key=token)


@router.post("/keys/{key_id}/revoke", response_model=ApiKeyRead)
async def revoke_key(key_id: uuid.UUID, db: DbSession, account: SuperAdmin) -> ApiKey:
    key = await db.get(ApiKey, key_id)
    if key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API key not found")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        await record_activity(
            db,
            action="Revoked an API key",
            category=ActivityCategory.SYSTEM,
            account=account,
            severity=ActivitySeverity.WARNING,
            target=key.name,
            commit=False,
        )
        await db.commit()
        await db.refresh(key)
    return key


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(key_id: uuid.UUID, db: DbSession, account: SuperAdmin) -> None:
    key = await db.get(ApiKey, key_id)
    if key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API key not found")
    name = key.name
    await db.delete(key)
    await record_activity(
        db,
        action="Deleted an API key",
        category=ActivityCategory.SYSTEM,
        account=account,
        severity=ActivitySeverity.WARNING,
        target=name,
        commit=False,
    )
    await db.commit()


@router.get("/stats", response_model=ApiStats)
async def stats(db: DbSession, hours: Annotated[int, Query()] = 24) -> ApiStats:
    if hours not in ALLOWED_HOURS:
        hours = 24
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    in_window = ApiRequestLog.created_at >= since
    is_error = case((ApiRequestLog.status_code >= 400, 1), else_=0)

    total, errors, avg_ms, p95_ms = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(is_error), 0),
                func.avg(ApiRequestLog.duration_ms),
                func.percentile_cont(0.95).within_group(ApiRequestLog.duration_ms),
            ).where(in_window)
        )
    ).one()

    bucket_unit = "hour" if hours <= 24 else "day"
    bucket = func.date_trunc(bucket_unit, ApiRequestLog.created_at).label("bucket")
    series_rows = (
        await db.execute(
            select(bucket, func.count(), func.coalesce(func.sum(is_error), 0))
            .where(in_window)
            .group_by(bucket)
            .order_by(bucket)
        )
    ).all()

    endpoint_rows = (
        await db.execute(
            select(ApiRequestLog.endpoint, func.count().label("n"))
            .where(in_window)
            .group_by(ApiRequestLog.endpoint)
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()
    status_rows = (
        await db.execute(
            select(ApiRequestLog.status_code, func.count().label("n"))
            .where(in_window)
            .group_by(ApiRequestLog.status_code)
            .order_by(ApiRequestLog.status_code)
        )
    ).all()

    now = datetime.now(timezone.utc)
    total_keys = (await db.execute(select(func.count()).select_from(ApiKey))).scalar_one()
    active_keys = (
        await db.execute(
            select(func.count())
            .select_from(ApiKey)
            .where(ApiKey.revoked_at.is_(None), or_(ApiKey.expires_at.is_(None), ApiKey.expires_at > now))
        )
    ).scalar_one()

    return ApiStats(
        hours=hours,
        requests=total,
        errors=int(errors),
        success_rate=round((total - int(errors)) / total * 100, 1) if total else None,
        avg_ms=round(avg_ms) if avg_ms is not None else None,
        p95_ms=round(p95_ms) if p95_ms is not None else None,
        active_keys=active_keys,
        total_keys=total_keys,
        bucket=bucket_unit,
        series=[ApiSeriesPoint(bucket=b, total=n, errors=int(e)) for b, n, e in series_rows],
        endpoints=[ApiCount(label=label, count=n) for label, n in endpoint_rows],
        statuses=[ApiCount(label=str(code), count=n) for code, n in status_rows],
    )


@router.get("/requests", response_model=ApiRequestPage)
async def list_requests(
    db: DbSession,
    key_id: uuid.UUID | None = None,
    outcome: Annotated[str | None, Query(pattern="^(ok|error)$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiRequestPage:
    conditions = []
    if key_id:
        conditions.append(ApiRequestLog.api_key_id == key_id)
    if outcome == "ok":
        conditions.append(ApiRequestLog.status_code < 400)
    elif outcome == "error":
        conditions.append(ApiRequestLog.status_code >= 400)
    total = (
        await db.execute(select(func.count()).select_from(ApiRequestLog).where(*conditions))
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(ApiRequestLog)
                .where(*conditions)
                .order_by(ApiRequestLog.created_at.desc(), ApiRequestLog.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return ApiRequestPage(items=list(rows), total=total)
