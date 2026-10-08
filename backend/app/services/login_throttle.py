"""Brute-force guard for POST /auth/login.

Counts recent FAILED attempts per email and per client IP in memory and refuses
further attempts once a window's limit is hit. Per-process only (a restart or a
second instance has its own counters) — a speed bump against password
guessing, not a substitute for a strong password. A successful sign-in clears
that email's counter.
"""

import time

WINDOW_SECONDS = 15 * 60
MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_IP = 20
_MAX_KEYS = 5000

_failures: dict[str, list[float]] = {}


def _recent(key: str, now: float) -> list[float]:
    kept = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
    if kept:
        _failures[key] = kept
    else:
        _failures.pop(key, None)
    return kept


def retry_after_seconds(email: str, ip: str | None) -> int:
    """0 if this attempt may proceed, else how many seconds until it may."""
    now = time.monotonic()
    waits = []
    for key, limit in ((f"email:{email}", MAX_FAILURES_PER_EMAIL), (f"ip:{ip}", MAX_FAILURES_PER_IP)):
        if key == "ip:None":
            continue
        recent = _recent(key, now)
        if len(recent) >= limit:
            waits.append(int(WINDOW_SECONDS - (now - recent[0])) + 1)
    return max(waits) if waits else 0


def record_failure(email: str, ip: str | None) -> None:
    now = time.monotonic()
    if len(_failures) >= _MAX_KEYS:
        _failures.clear()
    for key in (f"email:{email}", f"ip:{ip}"):
        if key == "ip:None":
            continue
        _failures.setdefault(key, []).append(now)


def clear_email(email: str) -> None:
    _failures.pop(f"email:{email}", None)
