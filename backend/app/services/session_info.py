"""Best-effort helpers for the "active sessions" feature — none of these can
ever be exact, and none of them may block or fail a login:

- Client IP: read from X-Forwarded-For (Railway sits behind a proxy) with a
  fallback to the raw connection address.
- Device label: a small hand-rolled User-Agent parser. There is no
  dependency added for this on purpose (a full UA-parsing library is
  overkill for "OS · Browser") — good enough for the common cases, not
  exhaustive.
- Location label: an IP geolocation lookup (ipapi.co's free tier) for a
  approximate city/country. Skipped entirely for private/local IPs. Any
  failure (timeout, rate limit, malformed response) just means no location —
  never raises.
"""

import ipaddress

import httpx
from fastapi import Request

GEO_LOOKUP_TIMEOUT_SECONDS = 3.0


def get_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # The first entry is the original client; anything after is
        # intermediate proxies.
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def parse_device_label(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    ua = user_agent

    if "Windows NT 10" in ua or "Windows NT 11" in ua:
        os_label = "Windows 10/11"
    elif "Windows NT" in ua:
        os_label = "Windows"
    elif "Mac OS X" in ua:
        os_label = "macOS"
    elif "Android" in ua:
        os_label = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        os_label = "iOS"
    elif "Linux" in ua:
        os_label = "Linux"
    else:
        os_label = "Unknown OS"

    # Order matters — Edge and Opera's User-Agent strings also contain
    # "Chrome/", so they have to be checked first.
    if "Edg/" in ua:
        browser_label = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser_label = "Opera"
    elif "Chrome/" in ua:
        browser_label = "Chrome"
    elif "Firefox/" in ua:
        browser_label = "Firefox"
    elif "Safari/" in ua:
        browser_label = "Safari"
    else:
        browser_label = "Unknown Browser"

    return f"{os_label} · {browser_label}"


def _is_public_ip(ip: str) -> bool:
    try:
        return not ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


async def lookup_location_label(ip: str | None) -> str | None:
    if not ip or not _is_public_ip(ip):
        return None
    try:
        async with httpx.AsyncClient(timeout=GEO_LOOKUP_TIMEOUT_SECONDS) as client:
            response = await client.get(f"https://ipapi.co/{ip}/json/")
        if response.status_code != 200:
            return None
        data = response.json()
        if data.get("error"):
            return None
        city = data.get("city")
        country = data.get("country_name")
        parts = [p for p in (city, country) if p]
        return ", ".join(parts) if parts else None
    except Exception:
        # Geolocation is a nice-to-have, never worth failing or delaying a
        # sign-in over — a slow/unreachable/rate-limited lookup just means no
        # location for this session.
        return None


# First path segment -> the label shown in the Active Sessions panel. The app
# reports the path it's on; the label is decided here so the browser can't make
# the panel display arbitrary text.
_MODULE_LABELS: dict[str, str] = {
    "": "Dashboard",
    "directory": "Employee Directory",
    "new-hires": "Onboarding New Hires",
    "onboarding": "Onboarding Tracker",
    "hmo-management": "HMO Management",
    "anniversaries": "Anniversaries",
    "birthdays": "Birthdays",
    "awards": "Recognition & Awards",
    "attendance-violations": "Violations",
    "attendance-reports": "Violations Report",
    "activity-logs": "Activity Logs",
    "analytics": "Analytics",
    "feedback": "Feedback",
    "user-management": "User Management",
    "database-backups": "Database Backups",
    "settings": "Settings",
    "profile": "My Profile",
}


def module_for_path(path: str) -> str | None:
    """Maps a reported app path ("/hmo-management/123") to a module label.
    None for anything that isn't an app page (e.g. /login), so nothing is
    recorded for it."""
    segment = path.strip().lstrip("/").split("/", 1)[0].split("?", 1)[0].split("#", 1)[0].lower()
    if segment == "login":
        return None
    return _MODULE_LABELS.get(segment, "Other")
