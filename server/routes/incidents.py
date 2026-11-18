from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.session import get_db
from models import Incident
from routes.deps import aware, utcnow
from schemas.incident import IncidentIn, IncidentOut, IncidentReceipt
from services import audit
from services.hashing import sha256_json
from services.receipts import sign_receipt
from services.references import make_reference

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _out(i: Incident) -> IncidentOut:
    out = IncidentOut.model_validate(i)
    out.created_at, out.received_at, out.occurred_at = aware(i.created_at), aware(i.received_at), aware(i.occurred_at)
    return out


@router.post("", response_model=IncidentReceipt, status_code=201)
def create_incident(body: IncidentIn, db: Session = Depends(get_db)):
    payload = body.model_dump(mode="json")
    content_hash = sha256_json(payload)
    existing = db.get(Incident, body.id)
    if existing:
        if existing.content_hash != content_hash:
            raise HTTPException(409, "A different report was already submitted with this ID")
        return IncidentReceipt(incident=_out(existing),
                               receipt=sign_receipt(existing.id, content_hash, aware(existing.received_at), duplicate=True))
    inc = Incident(**body.model_dump(), reference=make_reference("incident", body.id, aware(body.created_at)),
                   content_hash=content_hash, received_at=utcnow(), status="allegation")
    db.add(inc)
    # Audit payload deliberately excludes description/contact to keep the log privacy-preserving.
    audit.append(db, "incident.received", "incident", inc.id, {"category": inc.category, "hash": content_hash})
    db.commit()
    return IncidentReceipt(incident=_out(inc), receipt=sign_receipt(inc.id, content_hash, inc.received_at))


@router.get("", response_model=list[IncidentOut])
def list_incidents(category: str | None = None, status: str | None = None,
                   limit: int = Query(50, le=200), offset: int = 0, db: Session = Depends(get_db)):
    q = select(Incident).order_by(Incident.received_at.desc()).limit(limit).offset(offset)
    if category:
        q = q.where(Incident.category == category)
    if status:
        q = q.where(Incident.status == status)
    return [_out(i) for i in db.scalars(q)]


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return _out(inc)
