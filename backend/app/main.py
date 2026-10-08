import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.services.fallback_admin import ensure_fallback_admin

settings = get_settings()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Seed the email + password fallback admin (a no-op unless
    # FALLBACK_ADMIN_PASSWORD is set). Never allowed to stop the API booting.
    try:
        await ensure_fallback_admin(settings)
    except Exception:
        logger.exception("Couldn't seed the fallback admin account")
    yield


app = FastAPI(
    lifespan=lifespan,
    title="TGO Workforce API",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Backs the signed, httpOnly session cookie the Zoho login flow sets
# (app/api/routes/auth.py) and app.core.auth.get_current_account reads.
# Frontend and backend are separate origins (different Railway domains), so in
# production the cookie has to be SameSite=None + Secure to survive that
# cross-site fetch at all; locally, over http, "lax" + non-secure is fine.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie=settings.session_cookie_name,
    max_age=settings.session_max_age_seconds,
    same_site="none" if settings.is_production else "lax",
    https_only=settings.is_production,
)

app.include_router(api_router)
