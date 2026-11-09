"""The permission matrix — Super-Admin-only. Regular Admin has full access to
every module already (see FULL_ACCESS_ROLES in app/services/permissions.py);
reconfiguring what every *other* role is allowed to do is Super Admin's alone.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.core.db import get_db
from app.models.account import Account
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.schemas.permission import PermissionInfo, PermissionMatrixRead, PermissionMatrixUpdate, RoleMatrixEntry
from app.services.activity_log import record_activity
from app.services.permissions import FULL_ACCESS_ROLES, MATRIX_ROLES, PERMISSION_LABELS, get_full_matrix, replace_matrix

router = APIRouter(prefix="/permissions", tags=["permissions"], dependencies=[Depends(require_super_admin)])

DbSession = Annotated[AsyncSession, Depends(get_db)]
SuperAdmin = Annotated[Account, Depends(require_super_admin)]


@router.get("/matrix", response_model=PermissionMatrixRead)
async def get_matrix(db: DbSession) -> PermissionMatrixRead:
    matrix = await get_full_matrix(db)
    return PermissionMatrixRead(
        permissions=[
            PermissionInfo(key=permission, title=info["title"], description=info["description"])
            for permission, info in PERMISSION_LABELS.items()
        ],
        roles=[
            RoleMatrixEntry(role=role, permissions=sorted(matrix[role], key=lambda p: p.value))
            for role in [*MATRIX_ROLES, *sorted(FULL_ACCESS_ROLES, key=lambda r: r.value)]
        ],
    )


@router.put("/matrix", response_model=PermissionMatrixRead)
async def update_matrix(payload: PermissionMatrixUpdate, db: DbSession, account: SuperAdmin) -> PermissionMatrixRead:
    matrix: dict = {role: set(permissions) for role, permissions in payload.grants.items()}
    await replace_matrix(db, matrix)

    await record_activity(
        db,
        action="Updated the permission matrix",
        category=ActivityCategory.ACCESS,
        account=account,
        severity=ActivitySeverity.WARNING,
        details={role.value: [p.value for p in permissions] for role, permissions in matrix.items()},
        commit=False,
    )
    await db.commit()

    updated = await get_full_matrix(db)
    return PermissionMatrixRead(
        permissions=[
            PermissionInfo(key=permission, title=info["title"], description=info["description"])
            for permission, info in PERMISSION_LABELS.items()
        ],
        roles=[
            RoleMatrixEntry(role=role, permissions=sorted(updated[role], key=lambda p: p.value))
            for role in [*MATRIX_ROLES, *sorted(FULL_ACCESS_ROLES, key=lambda r: r.value)]
        ],
    )
