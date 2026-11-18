"""Tamper-evident (hash-chained) audit log."""
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import AuditRecord
from services.hashing import sha256_json

GENESIS = "0" * 64


def _record_hash(prev_hash: str, at: str, action: str, entity_type: str, entity_id: str, payload: dict) -> str:
    return sha256_json({"prev": prev_hash, "at": at, "action": action, "type": entity_type,
                        "id": entity_id, "payload": payload})


def append(db: Session, action: str, entity_type: str, entity_id: str, payload: dict[str, Any] | None = None) -> AuditRecord:
    payload = payload or {}
    last = db.scalar(select(AuditRecord).order_by(AuditRecord.seq.desc()).limit(1))
    prev = last.hash if last else GENESIS
    at = datetime.now(UTC).replace(microsecond=0)
    rec = AuditRecord(at=at, action=action, entity_type=entity_type, entity_id=entity_id, payload=payload,
                      prev_hash=prev, hash=_record_hash(prev, at.isoformat(), action, entity_type, entity_id, payload))
    db.add(rec)
    return rec


def verify_chain(db: Session) -> dict[str, Any]:
    prev = GENESIS
    count = 0
    for rec in db.scalars(select(AuditRecord).order_by(AuditRecord.seq)):
        at = rec.at if rec.at.tzinfo else rec.at.replace(tzinfo=UTC)
        expected = _record_hash(prev, at.isoformat(), rec.action, rec.entity_type, rec.entity_id, rec.payload)
        if rec.prev_hash != prev or rec.hash != expected:
            return {"valid": False, "records_checked": count, "broken_at_seq": rec.seq}
        prev = rec.hash
        count += 1
    return {"valid": True, "records_checked": count, "head": prev}
