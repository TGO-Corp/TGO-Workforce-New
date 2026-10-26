import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiKeyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    key_prefix: str
    scopes: list[str]
    created_by_label: str
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(min_length=1)
    # Days until the key stops working; null = never expires.
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class ApiKeyCreated(ApiKeyRead):
    """Returned once, on creation - the only time the full key is visible."""

    key: str


class ApiRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key_name: str | None
    method: str
    path: str
    status_code: int
    duration_ms: int
    client_ip: str | None
    created_at: datetime


class ApiRequestPage(BaseModel):
    items: list[ApiRequestRead]
    total: int


class ApiSeriesPoint(BaseModel):
    bucket: datetime
    total: int
    errors: int


class ApiCount(BaseModel):
    label: str
    count: int


class ApiStats(BaseModel):
    hours: int
    requests: int
    errors: int
    success_rate: float | None
    avg_ms: int | None
    p95_ms: int | None
    active_keys: int
    total_keys: int
    bucket: str  # "hour" | "day"
    series: list[ApiSeriesPoint]
    endpoints: list[ApiCount]
    statuses: list[ApiCount]


class PublicAward(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: str
    employee_name: str
    employee_office: str
    title: str
    description: str | None
    awarded_date: date
