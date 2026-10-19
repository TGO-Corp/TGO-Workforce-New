from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str | None
    link: str | None
    is_read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    count: int


class NotificationPage(BaseModel):
    """One page of GET /notifications/page — what the Notifications module shows."""

    items: list[NotificationRead]
    # Notifications matching the page's filters (all pages) ...
    total: int
    # ... and how many unread ones the caller has overall, ignoring the filters.
    unread: int


class DeletedCount(BaseModel):
    deleted: int
