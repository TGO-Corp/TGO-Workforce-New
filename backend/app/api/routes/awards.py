import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.db import get_db
from app.models.account import Account
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.models.award import Award
from app.models.employee import Employee, EmployeeStatus
from app.models.permission import Permission
from app.schemas.award import AwardCreate, AwardRead, AwardUpdate
from app.services.activity_log import record_activity

# Router-level dependency: every route needs Permission.AWARDS_VIEW (matrix-
# configurable — see DEFAULT_GRANTS in app/services/permissions.py). The
# three write routes below additionally depend on ManagerAccount
# (Permission.AWARDS_MANAGE).
router = APIRouter(
    prefix="/awards",
    tags=["awards"],
    dependencies=[Depends(require_permission(Permission.AWARDS_VIEW))],
)

DbSession = Annotated[AsyncSession, Depends(get_db)]
ManagerAccount = Annotated[Account, Depends(require_permission(Permission.AWARDS_MANAGE))]


def _actor_label(account: Account) -> str:
    return account.display_name or account.email


@router.get("", response_model=list[AwardRead])
async def list_awards(
    db: DbSession,
    employee_id: str | None = None,
    limit: Annotated[int, Query(le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Award]:
    stmt = select(Award).order_by(
        Award.awarded_date.desc(), Award.created_at.desc(), Award.id.desc()
    )
    if employee_id:
        stmt = stmt.where(Award.employee_id == employee_id)
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=AwardRead, status_code=status.HTTP_201_CREATED)
async def create_award(payload: AwardCreate, db: DbSession, account: ManagerAccount) -> Award:
    employee = await db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if employee.status != EmployeeStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Awards can only be given to active employees",
        )

    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Award title is required")

    award = Award(
        employee_id=employee.id,
        employee_name=employee.name,
        employee_office=employee.office,
        title=title,
        description=payload.description,
        awarded_date=payload.awarded_date,
        awarded_by_id=account.id,
        awarded_by_label=_actor_label(account),
    )
    db.add(award)
    await db.flush()

    await record_activity(
        db,
        action="Gave an award",
        category=ActivityCategory.EMPLOYEE,
        account=account,
        target=f"{award.title} · {employee.name}",
        commit=False,
    )
    await db.commit()
    await db.refresh(award)
    return award


@router.patch("/{award_id}", response_model=AwardRead)
async def update_award(award_id: uuid.UUID, payload: AwardUpdate, db: DbSession, account: ManagerAccount) -> Award:
    award = await db.get(Award, award_id)
    if award is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Award not found")

    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Award title is required")
    for field, value in changes.items():
        setattr(award, field, value)
    await db.flush()

    if changes:
        await record_activity(
            db,
            action="Updated an award",
            category=ActivityCategory.EMPLOYEE,
            account=account,
            target=f"{award.title} · {award.employee_name}",
            details={"changed_fields": list(changes.keys())},
            commit=False,
        )
    await db.commit()
    await db.refresh(award)
    return award


@router.delete("/{award_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_award(award_id: uuid.UUID, db: DbSession, account: ManagerAccount) -> None:
    award = await db.get(Award, award_id)
    if award is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Award not found")

    target = f"{award.title} · {award.employee_name}"
    await db.delete(award)
    await record_activity(
        db,
        action="Removed an award",
        category=ActivityCategory.EMPLOYEE,
        account=account,
        severity=ActivitySeverity.WARNING,
        target=target,
        commit=False,
    )
    await db.commit()
