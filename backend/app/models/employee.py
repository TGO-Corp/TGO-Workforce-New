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
    address: Mapped[str | None] = mapped_column(String(300))
    personal_email: Mapped[str | None] = mapped_column(String(254))
    preferred_name: Mapped[str | None] = mapped_column(String(100))

    # employment_type/work_arrangement are suggested-value free text, same
    # pattern as office/department/position above — a fixed Select list in
    # the UI, but not a closed set enforced here.
    employment_type: Mapped[str | None] = mapped_column(String(50))
    work_arrangement: Mapped[str | None] = mapped_column(String(50))
    # Plain text (not a foreign key to another Employee row) — this is a
    # free-text "who this person reports to" note, not a relation the app
    # queries by; keeps a manager's name/title entry simple even when that
    # person isn't themselves in this table yet.
    supervisor: Mapped[str | None] = mapped_column(String(200))

    tgo_email: Mapped[str | None] = mapped_column(String(254))
    lms_email: Mapped[str | None] = mapped_column(String(254))
    vonage_extension: Mapped[str | None] = mapped_column(String(20))

    emergency_contact_name: Mapped[str | None] = mapped_column(String(200))
    emergency_contact_relationship: Mapped[str | None] = mapped_column(String(100))
    emergency_contact_number: Mapped[str | None] = mapped_column(String(30))

    # Offboarding-only fields — set from the Manage Employees edit dialog
    # when a record's status moves to Resigned/Terminated, not from the New
    # Hire form.
    reason_for_separation: Mapped[str | None] = mapped_column(String(500))
    hr_remarks: Mapped[str | None] = mapped_column(String(1000))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
