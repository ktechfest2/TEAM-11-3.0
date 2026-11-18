import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import get_settings
from database.session import get_db
from models import Evidence
from routes.deps import aware, utcnow
from schemas.evidence import EvidenceMeta, EvidenceOut, EvidenceReceipt
from security.uploads import EXTENSIONS, sniff_image_type
from services import audit
from services.hashing import sha256_bytes
from services.receipts import sign_receipt
from services.references import make_reference

router = APIRouter(prefix="/evidence", tags=["evidence"])


def _out(ev: Evidence) -> EvidenceOut:
    out = EvidenceOut.model_validate(ev)
    out.captured_at, out.received_at = aware(ev.captured_at), aware(ev.received_at)
    return out


@router.post("", response_model=EvidenceReceipt, status_code=201)
async def upload_evidence(metadata: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
    settings = get_settings()
    try:
        meta = EvidenceMeta.model_validate(json.loads(metadata))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(422, f"Invalid metadata: {exc}") from exc

    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "File too large")
    mime = sniff_image_type(data[:16])
    if mime is None:
        raise HTTPException(415, "Only JPEG, PNG or WebP images are accepted")

    digest = sha256_bytes(data)
    if digest != meta.sha256:
        # The bytes changed between capture and upload (corruption or tampering in transit/storage).
        raise HTTPException(422, "Integrity check failed: file hash does not match the hash recorded at capture")

    existing = db.get(Evidence, meta.id)
    if existing:
        if existing.sha256 != digest:
            raise HTTPException(409, "A different file was already submitted with this evidence ID")
        return EvidenceReceipt(evidence=_out(existing),
                               receipt=sign_receipt(existing.id, existing.sha256, aware(existing.received_at), duplicate=True))

    rel = Path("evidence") / digest[:2] / f"{digest}.{EXTENSIONS[mime]}"
    dest = settings.storage_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():  # content-addressed: identical bytes are stored once
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(dest)

    captured = aware(meta.captured_at)
    ev = Evidence(
        id=meta.id, reference=make_reference("evidence", meta.id, captured), kind=meta.kind, sha256=digest,
        mime_type=mime, size_bytes=len(data), storage_path=str(rel), captured_at=captured, received_at=utcnow(),
        latitude=meta.latitude, longitude=meta.longitude, location_accuracy_m=meta.location_accuracy_m,
        polling_unit_code=meta.polling_unit_code, device_id=meta.device_id, note=meta.note,
    )
    db.add(ev)
    audit.append(db, "evidence.received", "evidence", ev.id, {"sha256": digest, "size": len(data)})
    db.commit()
    return EvidenceReceipt(evidence=_out(ev), receipt=sign_receipt(ev.id, digest, ev.received_at))


@router.get("", response_model=list[EvidenceOut])
def list_evidence(polling_unit_code: str | None = None, kind: str | None = None,
                  limit: int = Query(50, le=200), offset: int = 0, db: Session = Depends(get_db)):
    q = select(Evidence).order_by(Evidence.received_at.desc()).limit(limit).offset(offset)
    if polling_unit_code:
        q = q.where(Evidence.polling_unit_code == polling_unit_code)
    if kind:
        q = q.where(Evidence.kind == kind)
    return [_out(e) for e in db.scalars(q)]


@router.get("/{evidence_id}", response_model=EvidenceOut)
def get_evidence(evidence_id: str, db: Session = Depends(get_db)):
    ev = db.get(Evidence, evidence_id)
    if not ev:
        raise HTTPException(404, "Evidence not found")
    return _out(ev)


@router.get("/{evidence_id}/file")
def get_evidence_file(evidence_id: str, db: Session = Depends(get_db)):
    ev = db.get(Evidence, evidence_id)
    if not ev:
        raise HTTPException(404, "Evidence not found")
    path = (get_settings().storage_dir / ev.storage_path).resolve()
    if not path.is_relative_to(get_settings().storage_dir.resolve()) or not path.exists():
        raise HTTPException(404, "File missing")
    return FileResponse(path, media_type=ev.mime_type, headers={"X-Content-SHA256": ev.sha256})
