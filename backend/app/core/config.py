"""Application settings, read from environment variables (and a local .env in dev).

Railway injects DATABASE_URL automatically once a Postgres plugin is attached and
linked to this service; locally, copy .env.example to .env and fill it in.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"

    # Railway (and most managed Postgres providers) hand out a `postgres://` or
    # `postgresql://` URL. SQLAlchemy's async engine needs the `+asyncpg` driver
    # in the scheme, so `async_database_url` below rewrites it — always use that
    # property when building the engine, never `database_url` directly.
    database_url: str = "postgresql://postgres:postgres@localhost:5432/tgo_workforce"

    # Comma-separated list of allowed frontend origins, e.g.
    # "http://localhost:3000,https://tgo-workforce.up.railway.app"
    cors_origins: str = "http://localhost:3000"

    secret_key: str = "change-me-in-production"

    # Where the Zoho login flow (and logout) sends the browser back to. In
    # Railway, set this to the frontend service's public domain.
    frontend_url: str = "http://localhost:3000"

    # Session cookie — set by /auth/zoho/callback on a successful login, read
    # by app.core.auth.get_current_account on every request after that.
    session_cookie_name: str = "tgo_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 7  # 7 days

    # Zoho OAuth client — from https://api-console.zoho.com. Sign-in is
    # disabled (503) until all three are set.
    zoho_client_id: str | None = None
    zoho_client_secret: str | None = None
    zoho_redirect_uri: str | None = None

    # Comma-separated list of email addresses that are always promoted to
    # admin on Zoho sign-in (see app/api/routes/auth.py). This is the one way
    # to bootstrap the very first admin account without touching the
    # database directly — every other account starts as VIEWER and gets
    # promoted from the User Management page by an existing admin.
    zoho_admin_emails: str = ""

    # --- Zoho Mail (attendance violation notices) -----------------------------
    # A SEPARATE Zoho API registration/scope from zoho_client_id/secret above:
    # those are for "Sign in with Zoho" (AaaServer.profile.READ, shared across
    # the whole merged app); these are for actually sending mail through the
    # Zoho Mail API (ZohoMail.messages.CREATE) on behalf of the attendance
    # notice mailbox, ported from the standalone attendance app's
    # zoho_mail_* settings. Keep the two client id/secret pairs distinct even
    # if they end up pointing at the same Zoho org — a scope change to one
    # (e.g. widening login's profile scope) should never accidentally touch
    # the other's send credentials.
    zoho_mail_client_id: str = ""
    zoho_mail_client_secret: str = ""
    zoho_mail_refresh_token: str = ""
    # The Zoho Mail "accountId" that owns the sending mailbox (attendance@...).
    zoho_mail_account_id: str = ""
    zoho_mail_from_address: str = "attendance@tgocorp.com"
    zoho_mail_api_base_url: str = "https://mail.zoho.com/api"
    # Comma-separated list of OTHER addresses validated as "send as" aliases
    # on the connected Zoho Mail account, if any exist beyond
    # zoho_mail_from_address. Surfaced via GET /violations/email-sender-config
    # so the "From address override" picker in the UI only offers addresses
    # someone has actually confirmed Zoho will honor.
    zoho_mail_known_aliases: str = ""

    # How often (in seconds) the standalone send worker
    # (app/workers/violation_email_worker.py) polls for Approved/Resend
    # Approved violation records to send. Runs as its own process/service,
    # separate from the API — see that module's docstring.
    violation_send_worker_poll_seconds: int = 120

    # --- Zoho Cliq (onboarding "Notify" button) ---------------------------
    # A Cliq Incoming Webhook, ported from the standalone onboarding app
    # (backend/CLIQ_SETUP.md there) — one-time setup: generate a Webhook
    # Token from a Cliq account's own Settings > Bots & Tools > Webhook
    # Tokens (NOT the channel's Connectors tab, which is for a different,
    # unrelated Cliq feature). See app/services/cliq_notify.py.
    cliq_webhook_endpoint: str = ""
    cliq_webhook_token: str = ""

    # --- Onboarding/Offboarding portal (New Hires) -------------------------
    # A separate, already-deployed system that tracks candidates through the
    # actual hiring pipeline (PENDING/IN_PROGRESS/COMPLETED). Its
    # GET-only /api/external/new-hires API replaces this app's own New Hires
    # page as of the page's rewrite — see app/services/onboarding_portal.py.
    # Auth is a plain `x-api-key` header, not Authorization: Bearer.
    onboarding_portal_base_url: str = ""
    onboarding_portal_api_key: str = ""

    # --- Email + password fallback sign-in ----------------------------------
    # A local sign-in that works whichever of Zoho / the Gateway is in front,
    # for when SSO is down or misconfigured. Only accounts with a
    # password_hash can use it. PASSWORD_LOGIN_ENABLED=false switches it off.
    password_login_enabled: bool = True
    # If FALLBACK_ADMIN_PASSWORD is set, startup makes sure this Admin account
    # exists with that password (see app/services/fallback_admin.py). The
    # password lives ONLY in the environment, never in code or git. An
    # existing password is never overwritten.
    fallback_admin_email: str = "admin@tgocorp.com"
    fallback_admin_password: str = ""

    # --- TGO Gateway single sign-on ----------------------------------------
    # Set GATEWAY_URL (https://gateway.tgocorp.com) and the Gateway owns
    # sign-in: every request forwards the shared Gateway cookie to
    # ${GATEWAY_URL}/api/auth/verify with {toolId: gateway_tool_id}, and the
    # in-app Zoho login is switched off. Leave it empty for local development
    # and the Zoho login above keeps working unchanged. See app/core/gateway.py.
    gateway_url: str = ""
    # Must equal the tool's id in the Gateway registry (TGO-Gateway-Portal
    # src/data/tools.ts), or verify answers 403 for everyone but Super Admin.
    gateway_tool_id: str = "workforce"
    gateway_session_cookie: str = "tgo_gateway_session"

    @property
    def gateway_enabled(self) -> bool:
        return bool(self.gateway_url.strip())

    @property
    def gateway_base_url(self) -> str:
        return self.gateway_url.strip().rstrip("/")

    @property
    def cliq_configured(self) -> bool:
        return bool(self.cliq_webhook_endpoint and self.cliq_webhook_token)

    @property
    def onboarding_portal_configured(self) -> bool:
        return bool(self.onboarding_portal_base_url and self.onboarding_portal_api_key)

    @property
    def zoho_configured(self) -> bool:
        return bool(self.zoho_client_id and self.zoho_client_secret and self.zoho_redirect_uri)

    @property
    def zoho_mail_configured(self) -> bool:
        return bool(
            self.zoho_mail_client_id and self.zoho_mail_client_secret and self.zoho_mail_refresh_token
        )

    @property
    def zoho_mail_known_alias_list(self) -> list[str]:
        return [a.strip() for a in self.zoho_mail_known_aliases.split(",") if a.strip()]

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.zoho_admin_emails.split(",") if e.strip()}

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
