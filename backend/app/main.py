import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.db import AsyncSessionLocal
from app.models.api_key import ApiRequestLog
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

PUBLIC_PREFIX = "/public/v1"


@app.middleware("http")
async def log_public_api_requests(request: Request, call_next):
    """Records every call to the keyed public API (successful or not) for the
    API Access module's Overview and Activity tabs. Never allowed to break the
    response itself."""
    if not request.url.path.startswith(PUBLIC_PREFIX):
        return await call_next(request)
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        try:
            rest = request.url.path[len(PUBLIC_PREFIX) :].strip("/")
            forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            async with AsyncSessionLocal() as session:
                session.add(
                    ApiRequestLog(
                        api_key_id=getattr(request.state, "api_key_id", None),
                        key_name=getattr(request.state, "api_key_name", None),
                        method=request.method,
                        endpoint="/" + (rest.split("/")[0] if rest else ""),
                        path=request.url.path[:300],
                        status_code=status_code,
                        duration_ms=round((time.perf_counter() - started) * 1000),
                        client_ip=forwarded or (request.client.host if request.client else None),
                    )
                )
                await session.commit()
        except Exception:
            logger.exception("Couldn't log a public API request")


app.include_router(api_router)
