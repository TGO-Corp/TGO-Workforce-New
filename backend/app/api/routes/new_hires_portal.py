"""Read-only proxy for the New Hires page — the page itself used to be a
filtered view of the Employee Directory, but now mirrors the separate
Onboarding/Offboarding portal's own GET-only API instead (see
app/services/onboarding_portal.py). Gated by its own Permission.NEW_HIRES_VIEW (the same one the page's nav
entry declares in src/components/app-sidebar.tsx) so a role such as Viewer
can be kept out of it from the permission matrix.
"""

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import require_permission
from app.models.permission import Permission
from app.services.onboarding_portal import (
    OnboardingPortalNotConfiguredError,
    PortalNewHire,
    fetch_portal_new_hires,
)

router = APIRouter(
    prefix="/new-hires",
    tags=["new-hires"],
    dependencies=[Depends(require_permission(Permission.NEW_HIRES_VIEW))],
)


@router.get("", response_model=list[PortalNewHire])
async def list_portal_new_hires(
    portal_status: Annotated[str | None, Query(alias="status")] = None,
    updated_since: Annotated[str | None, Query(alias="updatedSince")] = None,
) -> list[PortalNewHire]:
    try:
        return await fetch_portal_new_hires(status=portal_status, updated_since=updated_since)
    except OnboardingPortalNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Onboarding portal request failed: {exc}",
        ) from exc
