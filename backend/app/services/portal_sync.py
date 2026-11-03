"""Keeps Workforce in step with the Onboarding & Offboarding Portal.

A background loop (started from app/main.py's lifespan) polls the portal's
read-only external API every few seconds, turns anything new or changed into a
PortalEvent, and notifies everyone who holds Permission.PORTAL_ACTIVITY_VIEW -
labelled as coming from the portal. The portal has no webhooks, so polling with
its updatedSince/createdSince parameters is the way to be "live"; the Dashboard
then polls Workforce's own database, so nothing here is hit per page view.

Events are unique per (record, status), so overlapping polls, several API
instances, or a restart never produce duplicates or double notifications. The
first sync of each dataset is silent (it only fills the feed), so connecting the
portal doesn't flood anyone with its whole history.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import AsyncSessionLocal
from app.models.permission import Permission
from app.models.portal_event import PortalEvent, PortalSyncState
from app.services.notify import notify_permission_holders

logger = logging.getLogger(__name__)

NOTIFICATION_SOURCE = "onboarding_portal"
REQUEST_TIMEOUT = 15


@dataclass(frozen=True)
class Dataset:
    entity: str
    path: str
    list_key: str
    # Which "changed since" parameter the endpoint takes; None = fetch it all
    # (asset returns have no updatedAt, and their status does change).
    since_param: str | None
    time_field: str
    status_field: str | None
    label: str


DATASETS: tuple[Dataset, ...] = (
    Dataset("new_hire", "new-hires", "newHires", "updatedSince", "updatedAt", "status", "New hires"),
    Dataset("exit_request", "exit-requests", "exitRequests", "updatedSince", "updatedAt", "status", "Exit requests"),
    Dataset("final_pay", "final-pay", "finalPay", "updatedSince", "updatedAt", "status", "Final pay"),
    Dataset("asset_return", "asset-returns", "assetReturns", None, "createdAt", "assetStatus", "Asset returns"),
    Dataset("exit_interview", "exit-interviews", "exitInterviews", "createdSince", "createdAt", None, "Exit interviews"),
)

_sync_lock = asyncio.Lock()


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _humanize(status: str) -> str:
    return status.replace("_", " ").strip().capitalize()


def _day(value: Any) -> str | None:
    parsed = _parse_time(value)
    return parsed.strftime("%b %d, %Y").replace(" 0", " ") if parsed else None


def describe(entity: str, row: dict[str, Any], live_new: bool) -> tuple[str, str, str | None, str | None]:
    """(state, title, detail, employee name) for one portal record. `live_new`
    is true the first time a record is seen while the feed is already running."""
    if entity == "new_hire":
        name = row.get("name") or "A new hire"
        state = str(row.get("status") or "recorded")
        bits = [row.get("position"), row.get("department")]
        start = _day(row.get("startDate"))
        if start:
            bits.append(f"starts {start}")
        detail = " · ".join(str(b) for b in bits if b) or None
        title = f"New hire added: {name}" if live_new else f"Onboarding {_humanize(state).lower()}: {name}"
        return state, title, detail, name

    if entity == "exit_request":
        name = row.get("employeeName") or "An employee"
        state = str(row.get("status") or "recorded")
        bits = []
        last_day = _day(row.get("lastWorkingDate"))
        if last_day:
            bits.append(f"Last working day {last_day}")
        if row.get("employeeDepartment"):
            bits.append(str(row["employeeDepartment"]))
        if live_new and row.get("reason"):
            bits.append(str(row["reason"]))
        if row.get("approvedBy") and state == "APPROVED":
            bits.append(f"approved by {row['approvedBy']}")
        title = f"Exit request filed: {name}" if live_new else f"Exit request {_humanize(state).lower()}: {name}"
        return state, title, " · ".join(bits) or None, name

    if entity == "final_pay":
        name = row.get("employeeName") or "An employee"
        state = str(row.get("status") or "recorded")
        release = _day(row.get("releaseDate"))
        detail = f"Released {release}" if release and state == "RELEASED" else None
        title = f"Final pay started: {name}" if live_new else f"Final pay {_humanize(state).lower()}: {name}"
        return state, title, detail, name

    if entity == "asset_return":
        name = row.get("employeeName") or "An employee"
        state = str(row.get("assetStatus") or "recorded")
        asset = row.get("assetType") or "Asset"
        bits = [row.get("assetTag"), row.get("condition")]
        detail = " · ".join(str(b) for b in bits if b) or None
        return state, f"{asset} {_humanize(state).lower()}: {name}", detail, name

    # exit_interview: never carries the feedback or rating, only that it happened.
    name = row.get("employeeName") or "An employee"
    interviewer = row.get("interviewer")
    return (
        "recorded",
        f"Exit interview completed: {name}",
        f"Interviewer {interviewer}" if interviewer else None,
        name,
    )


def _link_for(entity: str) -> str:
    return "/new-hires" if entity == "new_hire" else "/"


def _error_message(dataset: Dataset, exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 401:
            return "The portal rejected the API key (401). Check ONBOARDING_PORTAL_API_KEY."
        if code == 403:
            return f"The API key doesn't include the {dataset.label.lower()} module (403)."
        return f"The portal returned {code} for {dataset.label.lower()}."
    return f"Couldn't reach the portal for {dataset.label.lower()}: {type(exc).__name__}"


async def _sync_dataset(db: AsyncSession, client: httpx.AsyncClient, dataset: Dataset) -> int:
    settings = get_settings()
    state = await db.get(PortalSyncState, dataset.entity)
    if state is None:
        state = PortalSyncState(entity=dataset.entity)
        db.add(state)
        await db.flush()

    backfill = state.initialized_at is None
    params: dict[str, str] = {}
    if dataset.since_param and state.cursor is not None:
        params[dataset.since_param] = state.cursor.isoformat()

    try:
        response = await client.get(
            f"{settings.onboarding_portal_base_url.rstrip('/')}/api/external/{dataset.path}",
            headers={"x-api-key": settings.onboarding_portal_api_key},
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        rows = response.json().get(dataset.list_key, [])
    except Exception as exc:  # noqa: BLE001 - recorded and surfaced, never raised
        state.last_error = _error_message(dataset, exc)[:300]
        await db.commit()
        return 0

    newest = state.cursor
    created = 0
    for row in rows:
        record_id = str(row.get("id") or "")
        occurred = _parse_time(row.get(dataset.time_field)) or datetime.now(timezone.utc)
        if not record_id:
            continue
        if newest is None or occurred > newest:
            newest = occurred

        seen_record = (
            await db.execute(
                select(PortalEvent.id)
                .where(PortalEvent.entity == dataset.entity, PortalEvent.record_id == record_id)
                .limit(1)
            )
        ).scalar_one_or_none()
        live_new = seen_record is None and not backfill
        event_state, title, detail, name = describe(dataset.entity, row, live_new)

        inserted = (
            await db.execute(
                pg_insert(PortalEvent)
                .values(
                    entity=dataset.entity,
                    record_id=record_id,
                    state=event_state,
                    kind="new" if live_new else "update",
                    title=title[:255],
                    detail=detail,
                    employee_name=(name or None) and name[:200],
                    occurred_at=occurred,
                )
                .on_conflict_do_nothing(constraint="uq_portal_event_state")
                .returning(PortalEvent.id)
            )
        ).scalar_one_or_none()
        if inserted is None:
            continue  # already recorded (and notified) by an earlier poll
        created += 1
        if not backfill:
            await notify_permission_holders(
                db,
                Permission.PORTAL_ACTIVITY_VIEW,
                title=title,
                body=detail,
                link=_link_for(dataset.entity),
                source=NOTIFICATION_SOURCE,
                commit=False,
            )

    now = datetime.now(timezone.utc)
    state.cursor = newest
    state.initialized_at = state.initialized_at or now
    state.last_synced_at = now
    state.last_error = None
    await db.commit()
    return created


async def sync_once() -> int:
    """One pass over every dataset. Returns how many new events were recorded.
    Serialised, so a manual "sync now" can't overlap the background loop."""
    settings = get_settings()
    if not settings.onboarding_portal_configured:
        return 0
    async with _sync_lock:
        total = 0
        async with httpx.AsyncClient() as client:
            for dataset in DATASETS:
                async with AsyncSessionLocal() as db:
                    try:
                        total += await _sync_dataset(db, client, dataset)
                    except Exception:
                        await db.rollback()
                        logger.exception("Portal sync failed for %s", dataset.entity)
        return total


async def run_portal_sync_loop() -> None:
    """Runs for the life of the API process. Never raises."""
    await asyncio.sleep(5)  # let the app finish starting before the first poll
    while True:
        try:
            await sync_once()
        except Exception:
            logger.exception("Portal sync pass failed")
        await asyncio.sleep(max(5, get_settings().onboarding_portal_poll_seconds))
