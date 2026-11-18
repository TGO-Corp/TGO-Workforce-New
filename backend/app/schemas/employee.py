from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.employee import EmployeeStatus


class EmployeeBase(BaseModel):
    name: str
    office: str = "PH Eastwood"
    department: str = ""
    position: str = ""
    level: str = ""
    job_offer_date: date | None = None
    start_date: date
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    exit_date: date | None = None
    birthday: date | None = None
    source_type: str | None = None
    phone: str | None = None


class EmployeeCreate(EmployeeBase):
    """Used by the New Hire form. id is always server-generated (TGO-####),
    never supplied by the client."""


class EmployeeUpdate(BaseModel):
    """Every field optional — a PATCH only touches what's actually sent, and
    the route logs exactly which fields changed."""

    # id doubles as the primary key (see app/models/employee.py) — the route
    # handles this specially: a value that differs from the current id
    # renames the record (uniqueness-checked) rather than being set with the
    # rest of the fields.
    id: str | None = None
    name: str | None = None
    office: str | None = None
    department: str | None = None
    position: str | None = None
    level: str | None = None
    job_offer_date: date | None = None
    start_date: date | None = None
    status: EmployeeStatus | None = None
    exit_date: date | None = None
    birthday: date | None = None
    source_type: str | None = None
    phone: str | None = None


class EmployeeImportRow(BaseModel):
    """One row from an Excel/CSV import. Everything but name is optional,
    mirroring ImportEmployeesDialog/addEmployees() on the frontend — a row
    with no name is dropped rather than rejecting the whole file."""

    id: str | None = None
    name: str
    office: str | None = None
    department: str | None = None
    position: str | None = None
    level: str | None = None
    job_offer_date: date | None = None
    start_date: date | None = None
    status: EmployeeStatus | None = None
    exit_date: date | None = None
    birthday: date | None = None
    source_type: str | None = None
    phone: str | None = None


class EmployeeImportResult(BaseModel):
    added: int
    skipped: int


class EmployeeBulkDeleteRequest(BaseModel):
    """Backs the Employee Directory's checkbox multi-select delete."""

    ids: list[str]


class EmployeeBulkDeleteResult(BaseModel):
    deleted: int
    # ids that were requested but didn't match any record — e.g. another
    # tab/user already deleted them. Not an error; the caller decides whether
    # to surface it.
    not_found: list[str]


class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
