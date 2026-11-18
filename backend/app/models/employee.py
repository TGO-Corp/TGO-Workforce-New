"""The Employee table — matches the frontend's Employee shape exactly
(src/data/employees.ts and the Manage/New Hire dialog forms), so the eventual
swap from in-memory + localStorage to this API is a straight data-source
change, not a redesign.
"""

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class EmployeeStatus(enum.StrEnum):
    """Values (and casing) match the frontend's EmployeeStatus union exactly —
    "Active", not "active" — so there's no translation layer between the API
    and the UI that already hardcodes these three strings."""

    ACTIVE = "Active"
    RESIGNED = "Resigned"
    TERMINATED = "Terminated"


class Employee(Base):
    __tablename__ = "employees"

    # The business-facing "TGO-1001" style ID doubles as the primary key — the
    # frontend already treats it as this record's identity (react keys,
    # activity-log targets, CSV/Excel import matching), so a separate
    # surrogate key would just be one more id to keep in sync.
    id: Mapped[str] = mapped_column(String(20), primary_key=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)

    # office/department/position are free-form strings, not enums: the
    # frontend types them as `string` (OFFICES/DEPARTMENTS/POSITIONS in
    # data/employees.ts are suggested dropdown values, not a closed set
    # enforced by the type system) — a new hub, department or title
    # shouldn't need a migration.
    office: Mapped[str] = mapped_column(
        String(100), nullable=False, default="PH Eastwood", index=True
    )
    department: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    position: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    # Free text and admin-editable (add/rename/delete presets) via the same
    # /list-options mechanism as department/position — not a fixed enum, so
    # an org can redefine its career ladder without a migration. Defaults to
    # empty rather than any particular rung: nobody's level should read as
    # "L1 - Associate" just because no one has set it yet.
    level: Mapped[str] = mapped_column(String(100), nullable=False, default="")

    job_offer_date: Mapped[date | None] = mapped_column(Date)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)

    # status IS a strict union in the frontend (metrics()/officeDistribution()
    # etc. all branch on it), so — unlike office/department/position — it gets
    # a real Postgres enum, same pattern as Account.role.
    status: Mapped[EmployeeStatus] = mapped_column(
        Enum(
            EmployeeStatus,
            name="employee_status",
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=EmployeeStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    exit_date: Mapped[date | None] = mapped_column(Date)
    # Nullable despite the frontend's non-optional `birthday: string`: the
    # Import dialog only requires Name, so a real imported row can leave this
    # blank — the frontend's own upcomingBirthdays() already guards for that
    # with `e.birthday &&`. Better to store NULL than an invalid empty date.
    birthday: Mapped[date | None] = mapped_column(Date)
    source_type: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
