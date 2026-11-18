import hashlib
import hmac
from datetime import UTC, datetime

from core.config import get_settings
from schemas.common import Receipt


def sign_receipt(record_id: str, content_hash: str, received_at: datetime, duplicate: bool = False) -> Receipt:
    if received_at.tzinfo is None:
        received_at = received_at.replace(tzinfo=UTC)
    msg = f"{record_id}|{content_hash}|{received_at.isoformat()}".encode()
    sig = hmac.new(get_settings().receipt_secret.encode(), msg, hashlib.sha256).hexdigest()
    return Receipt(record_id=record_id, content_hash=content_hash, received_at=received_at, signature=sig, duplicate=duplicate)
