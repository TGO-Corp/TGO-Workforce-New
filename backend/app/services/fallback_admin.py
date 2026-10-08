"""Startup seed for the email + password fallback admin.

Runs on every boot (idempotent). If FALLBACK_ADMIN_PASSWORD is set in the
environment, makes sure an Admin account exists for FALLBACK_ADMIN_EMAIL
(default admin@tgocorp.com) that can sign in with it. The password is read from
the environment only — it is never in code, migrations or git history.

Rules, so a boot can never quietly weaken or undo anything:
  * missing account  -> created as Admin with the hash
  * account without a password -> the hash is set (role left as it is)
  * account that already has a password -> left completely alone, so changing
    the environment variable later does NOT reset it (rotate it by clearing
    the hash in the database, or with a password-change feature).
"""

import asyncio
import logging

from sqlalchemy import func, select

from app.core.config import Settings
from app.core.db import AsyncSessionLocal
from app.models.account import Account, AccountRole
from app.models.activity_log import ActivityCategory, ActivitySeverity
from app.services.activity_log import record_activity
from app.services.passwords import hash_password

logger = logging.getLogger(__name__)


async def ensure_fallback_admin(settings: Settings) -> None:
    email = settings.fallback_admin_email.strip().lower()
    password = settings.fallback_admin_password
    if not settings.password_login_enabled or not email or not password:
        return

    password_hash = await asyncio.to_thread(hash_password, password)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Account).where(func.lower(Account.email) == email))
        account = result.scalar_one_or_none()

        if account is None:
            db.add(
                Account(
                    # zoho_user_id is NOT NULL + unique; a local account has no
                    # ZUID, so it carries a clearly-marked local id instead.
                    zoho_user_id=f"local:{email}",
                    email=email,
                    first_name="Fallback",
                    last_name="Admin",
                    display_name="Fallback Admin",
                    role=AccountRole.ADMIN,
                    password_hash=password_hash,
                )
            )
            action = "Fallback admin account created"
        elif account.password_hash is None:
            account.password_hash = password_hash
            action = "Fallback admin password set on existing account"
        else:
            return

        await db.commit()
        await record_activity(
            db,
            action=action,
            category=ActivityCategory.ACCESS,
            actor_label="System",
            target=email,
            severity=ActivitySeverity.WARNING,
            commit=True,
        )
        logger.warning("%s: %s", action, email)
