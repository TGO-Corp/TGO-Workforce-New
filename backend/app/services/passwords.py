"""Password hashing for the email + password fallback sign-in.

Uses scrypt from the standard library (no extra dependency): memory-hard, with
a random per-password salt, stored as a self-describing string so the cost
parameters can be raised later without invalidating existing hashes:

    scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>

Verification is constant-time. hash/verify are CPU-bound (tens of ms), so
callers on the event loop should run them via asyncio.to_thread.
"""

import base64
import hashlib
import hmac
import secrets

_N = 2**14
_R = 8
_P = 1
_KEY_LEN = 32
# scrypt needs ~128 * N * r bytes; the default 32 MB cap is too close at N=2**14.
_MAXMEM = 64 * 1024 * 1024


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_KEY_LEN, maxmem=_MAXMEM
    )
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
            maxmem=_MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)
