import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.activity_log import ActivityCategory, ActivitySeverity


class ActivityLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: uuid.UUID | None
    actor_label: str
    action: str
    target: str | None
    category: ActivityCategory
    severity: ActivitySeverity
    details: dict[str, Any] | None
    created_at: datetime


class ActivityLogSummary(BaseModel):
    """Counts over EVERY entry the caller may see (ignoring the page's own
    search/filters) — what the Activity Logs page's summary cards show."""

    total: int
    critical: int
    warning: int
    info: int


class ActivityLogPage(BaseModel):
    """One page of GET /activity-logs/page: `items` is the requested slice,
    `total` how many entries match the filters (all pages)."""

    items: list[ActivityLogRead]
    total: int
    summary: ActivityLogSummary
