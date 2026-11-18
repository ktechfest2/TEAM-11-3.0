"""Bearer-token authentication for native-speaker contributors.

Tokens are random 32-byte secrets shown once when an admin creates a contributor
(scripts/add_contributor.py); only their SHA-256 is stored.
"""
import hashlib
import secrets

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.session import get_db
from models import Contributor

bearer = HTTPBearer(auto_error=False)


def new_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def current_contributor(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Contributor:
    if not creds:
        raise HTTPException(401, "Contributor token required", headers={"WWW-Authenticate": "Bearer"})
    h = hashlib.sha256(creds.credentials.encode()).hexdigest()
    c = db.scalar(select(Contributor).where(Contributor.token_hash == h, Contributor.active.is_(True)))
    if not c:
        raise HTTPException(401, "Invalid or revoked contributor token", headers={"WWW-Authenticate": "Bearer"})
    return c


def require_language(c: Contributor, lang: str):
    if c.role != "admin" and lang not in (c.languages or []):
        raise HTTPException(403, f"You are not registered as a contributor for '{lang}'")


def require_reviewer(c: Contributor, lang: str):
    require_language(c, lang)
    if c.role not in ("reviewer", "admin"):
        raise HTTPException(403, "Reviewer role required")
