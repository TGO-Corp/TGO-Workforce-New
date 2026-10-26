"""The read-only public API other internal apps call with an API key (issued
in the API Access module). Every route is GET-only and keyed; each dataset is
a separate scope on the key. Requests are logged by the middleware in
app/main.py."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.award import Award
from app.models.employee import Employee, EmployeeStatus
from app.schemas.api_access import PublicAward
from app.schemas.employee import EmployeeRead
from app.services.api_keys import require_api_key

router = APIRouter(prefix="/public/v1", tags=["public-api"])

Db = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/employees",
    response_model=list[EmployeeRead],
    dependencies=[Depends(require_api_key("employees"))],
)
async def list_employees(
    db: Db,
    q: str | None = None,
    office: str | None = None,
    department: str | None = None,
    status_filter: Annotated[EmployeeStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Employee]:
    stmt = select(Employee)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Employee.name.ilike(like), Employee.id.ilike(like)))
    if office:
        stmt = stmt.where(Employee.office == office)
    if department:
        stmt = stmt.where(Employee.department == department)
    if status_filter:
        stmt = stmt.where(Employee.status == status_filter)
    result = await db.execute(stmt.order_by(Employee.id).limit(limit).offset(offset))
    return list(result.scalars().all())


@router.get(
    "/employees/{employee_id}",
    response_model=EmployeeRead,
    dependencies=[Depends(require_api_key("employees"))],
)
async def get_employee(employee_id: str, db: Db) -> Employee:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


@router.get(
    "/awards",
    response_model=list[PublicAward],
    dependencies=[Depends(require_api_key("awards"))],
)
async def list_awards(
    db: Db,
    employee_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Award]:
    stmt = select(Award)
    if employee_id:
        stmt = stmt.where(Award.employee_id == employee_id)
    result = await db.execute(
        stmt.order_by(Award.awarded_date.desc(), Award.id).limit(limit).offset(offset)
    )
    return list(result.scalars().all())
