from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_account, require_employee_writer, require_permission
from app.core.db import get_db
from app.models.account import Account
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.models.employee import Employee, EmployeeStatus
from app.models.permission import Permission
from app.schemas.employee import (
    EmployeeBulkDeleteRequest,
    EmployeeBulkDeleteResult,
    EmployeeCreate,
    EmployeeImportResult,
    EmployeeImportRow,
    EmployeeRead,
    EmployeeUpdate,
)
from app.services.activity_log import record_activity
from app.services.employee import next_employee_id

# Router-level dependency: every route here requires Permission.EMPLOYEES_VIEW
# (matrix-configurable; Admin/Super Admin always have it, and every other
# role holds it by default too — see DEFAULT_GRANTS in
# app/services/permissions.py — so this doesn't change anyone's access out
# of the box, it just makes it Super-Admin-adjustable going forward). The
# two read routes (list/get) stop there. The five write routes below
# additionally depend on require_employee_writer (Permission.EMPLOYEES_MANAGE).
router = APIRouter(
    prefix="/employees",
    tags=["employees"],
    dependencies=[Depends(require_permission(Permission.EMPLOYEES_VIEW))],
)

CurrentAccount = Annotated[Account | None, Depends(get_current_account)]
# Guaranteed non-None (require_employee_writer 403s otherwise) — used by the
# five write routes below for activity-log attribution.
WriterAccount = Annotated[Account, Depends(require_employee_writer)]


@router.get("", response_model=list[EmployeeRead])
async def list_employees(
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = None,
    office: str | None = None,
    department: str | None = None,
    status_filter: Annotated[EmployeeStatus | None, Query(alias="status")] = None,
    level_filter: Annotated[str | None, Query(alias="level")] = None,
    limit: Annotated[int, Query(le=1000)] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Employee]:
    """Backs the Employee Directory table — q matches the frontend's combined
    name/ID/position search box."""
    stmt = select(Employee)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Employee.name.ilike(like), Employee.id.ilike(like), Employee.position.ilike(like))
        )
    if office:
        stmt = stmt.where(Employee.office == office)
    if department:
        stmt = stmt.where(Employee.department == department)
    if status_filter:
        stmt = stmt.where(Employee.status == status_filter)
    if level_filter:
        stmt = stmt.where(Employee.level == level_filter)
    # id breaks name ties so paged fetches never repeat or skip a row.
    stmt = stmt.order_by(Employee.name, Employee.id).offset(offset).limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{employee_id}", response_model=EmployeeRead)
async def get_employee(employee_id: str, db: Annotated[AsyncSession, Depends(get_db)]) -> Employee:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


@router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    account: WriterAccount,
) -> Employee:
    """Backs the New Hire form — currently a UI-only stub on the frontend that
    just shows a toast; this is what it should call once wired up."""
    employee = Employee(id=await next_employee_id(db), **payload.model_dump())
    db.add(employee)
    await db.flush()

    await record_activity(
        db,
        action="Created employee record",
        category=ActivityCategory.EMPLOYEE,
        account=account,
        target=f"{employee.id} · {employee.name}",
        commit=False,
    )
    await db.commit()
    await db.refresh(employee)
    return employee


@router.post("/import", response_model=EmployeeImportResult)
async def import_employees(
    rows: list[EmployeeImportRow],
    db: Annotated[AsyncSession, Depends(get_db)],
    account: WriterAccount,
) -> EmployeeImportResult:
    """Backs Import from Excel. Mirrors the frontend's addEmployees(): a row
    with no name is skipped, everything else falls back to the same defaults
    the frontend uses (office -> "PH Eastwood", status -> Active, etc.)."""
    added = 0
    for row in rows:
        name = (row.name or "").strip()
        if not name:
            continue

        employee = Employee(
            id=row.id or await next_employee_id(db),
            name=name,
            office=row.office or "PH Eastwood",
            department=row.department or "",
            position=row.position or "",
            level=row.level or "",
            job_offer_date=row.job_offer_date,
            start_date=row.start_date or date.today(),
            status=row.status or EmployeeStatus.ACTIVE,
            exit_date=row.exit_date,
            birthday=row.birthday,
            source_type=row.source_type,
        )
        db.add(employee)
        # Flush (not commit) so the next row's next_employee_id() call, if it
        # needs one, sees this row's id and doesn't hand out a duplicate.
        await db.flush()
        added += 1

    if added:
        await record_activity(
            db,
            action="Bulk upload processed",
            category=ActivityCategory.DATA,
            account=account,
            target=f"{added} row{'s' if added != 1 else ''} imported",
            commit=False,
        )
    await db.commit()
    return EmployeeImportResult(added=added, skipped=len(rows) - added)


@router.patch("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    account: WriterAccount,
) -> Employee:
    """Backs the Manage Employees edit dialog — including renaming the
    Employee ID itself, which doubles as the primary key (see
    app/models/employee.py). A rename is uniqueness-checked before it's
    applied; every other field is a normal column update."""
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    changes = payload.model_dump(exclude_unset=True)

    old_id = employee.id
    new_id = changes.pop("id", None)
    if new_id is not None:
        new_id = new_id.strip()
        if not new_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Employee ID can't be empty"
            )
        if len(new_id) > 20:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee ID must be 20 characters or fewer",
            )
        if new_id != old_id:
            existing = await db.get(Employee, new_id)
            if existing is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Employee ID {new_id} is already in use",
                )
            employee.id = new_id

    for field, value in changes.items():
        setattr(employee, field, value)
    await db.flush()

    id_changed = new_id is not None and new_id != old_id
    if changes or id_changed:
        details: dict[str, object] = {"changed_fields": list(changes.keys())}
        if id_changed:
            details["id_changed_from"] = old_id
        await record_activity(
            db,
            action="Updated employee record",
            category=ActivityCategory.EMPLOYEE,
            account=account,
            target=f"{employee.id} · {employee.name}",
            details=details,
            commit=False,
        )
    await db.commit()
    await db.refresh(employee)
    return employee


@router.post("/bulk-delete", response_model=EmployeeBulkDeleteResult)
async def bulk_delete_employees(
    payload: EmployeeBulkDeleteRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    account: WriterAccount,
) -> EmployeeBulkDeleteResult:
    """Backs the Employee Directory's checkbox multi-select delete. One
    activity-log entry for the whole batch (not one per row) so a 40-row
    cleanup doesn't flood the audit trail."""
    ids = list(dict.fromkeys(payload.ids))  # de-dupe, keep the request order
    if not ids:
        return EmployeeBulkDeleteResult(deleted=0, not_found=[])

    result = await db.execute(select(Employee).where(Employee.id.in_(ids)))
    found = list(result.scalars().all())
    found_ids = {e.id for e in found}
    not_found = [i for i in ids if i not in found_ids]

    for employee in found:
        await db.delete(employee)

    if found:
        await record_activity(
            db,
            action="Bulk removed employee records",
            category=ActivityCategory.EMPLOYEE,
            account=account,
            severity=ActivitySeverity.WARNING,
            target=f"{len(found)} record{'s' if len(found) != 1 else ''}",
            details={"ids": sorted(found_ids)},
            commit=False,
        )
    await db.commit()
    return EmployeeBulkDeleteResult(deleted=len(found), not_found=not_found)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: str, db: Annotated[AsyncSession, Depends(get_db)], account: WriterAccount
) -> None:
    """Backs the Manage Employees delete confirmation."""
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    target = f"{employee.id} · {employee.name}"
    await db.delete(employee)
    await record_activity(
        db,
        action="Removed employee record",
        category=ActivityCategory.EMPLOYEE,
        account=account,
        severity=ActivitySeverity.WARNING,
        target=target,
        commit=False,
    )
    await db.commit()
