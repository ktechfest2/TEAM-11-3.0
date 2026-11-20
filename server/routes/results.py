import hmac
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.session import get_db
from core.config import get_settings
from models import OfficialResult, ResultSubmission
from routes.deps import aware, utcnow
from schemas.result import OfficialResultIn, OfficialResultOut, OfficialResultReceipt, ResultIn, ResultOut, ResultReceipt
from services import audit
from services.hashing import sha256_json
from services.receipts import sign_receipt
from services.references import make_reference
from services.validation import validate_result

router = APIRouter(prefix="/results", tags=["results"])


def _out(r: ResultSubmission) -> ResultOut:
    out = ResultOut.model_validate(r)
    out.created_at, out.received_at = aware(r.created_at), aware(r.received_at)
    return out


@router.post("", response_model=ResultReceipt, status_code=201)
def submit_result(body: ResultIn, db: Session = Depends(get_db)):
    payload = body.model_dump(mode="json")
    content_hash = sha256_json(payload)
    existing = db.get(ResultSubmission, body.id)
    if existing:
        if existing.content_hash != content_hash:
            raise HTTPException(409, "A different result submission already exists with this ID")
        return ResultReceipt(result=_out(existing),
                             receipt=sign_receipt(existing.id, content_hash, aware(existing.received_at), duplicate=True))
    # The server recomputes validation itself; it never trusts a client-supplied verdict.
    validation = validate_result(payload)
    rs = ResultSubmission(**{**body.model_dump(), "party_votes": payload["party_votes"]},
                          reference=make_reference("result", body.id, aware(body.created_at)),
                          source="independent_submission", validation=validation, content_hash=content_hash,
                          received_at=utcnow())
    db.add(rs)
    audit.append(db, "result.received", "result", rs.id,
                 {"pu": rs.polling_unit_code, "hash": content_hash, "validation": validation["status"]})
    db.commit()
    return ResultReceipt(result=_out(rs), receipt=sign_receipt(rs.id, content_hash, rs.received_at))


@router.get("", response_model=list[ResultOut])
def list_results(polling_unit_code: str | None = None, validation_status: str | None = None,
                 limit: int = Query(50, le=200), offset: int = 0, db: Session = Depends(get_db)):
    q = select(ResultSubmission).order_by(ResultSubmission.received_at.desc())
    if polling_unit_code:
        q = q.where(ResultSubmission.polling_unit_code == polling_unit_code)
    rows = [_out(r) for r in db.scalars(q)]
    if validation_status:
        rows = [r for r in rows if r.validation.get("status") == validation_status]
    return rows[offset: offset + limit]


@router.get("/compare/{polling_unit_code}")
def compare_submissions(polling_unit_code: str, election_type: str | None = None, db: Session = Depends(get_db)):
    """Compare independent submissions for one polling unit. Agreement between independent
    submitters raises confidence in the transcription; disagreement is flagged for review."""
    q = select(ResultSubmission).where(ResultSubmission.polling_unit_code == polling_unit_code)
    if election_type:
        q = q.where(ResultSubmission.election_type == election_type)
    subs = list(db.scalars(q))
    by_party: dict[str, set[int]] = defaultdict(set)
    for s in subs:
        for p in s.party_votes:
            by_party[p["party"].strip().upper()].add(p["votes"])
    disagreements = {party: sorted(v) for party, v in by_party.items() if len(v) > 1}
    return {
        "polling_unit_code": polling_unit_code,
        "independent_submissions": len(subs),
        "parties": {party: sorted(v) for party, v in by_party.items()},
        "disagreements": disagreements,
        "status": "no_submissions" if not subs else ("needs_review" if disagreements else
                                                    ("single_submission" if len(subs) == 1 else "submissions_agree")),
        "official": wall_vs_official(db, polling_unit_code, election_type, subs),
        "generated_at": utcnow(),
    }


def wall_vs_official(db: Session, pu: str, election_type: str | None, subs: list[ResultSubmission]) -> dict | None:
    """'What was on the wall' (what most independent EC8A submissions agree on) vs the latest
    officially published result for the same polling unit. None if no official result is entered."""
    q = select(OfficialResult).where(OfficialResult.polling_unit_code == pu).order_by(OfficialResult.received_at.desc())
    if election_type:
        q = q.where(OfficialResult.election_type == election_type)
    off = db.scalars(q).first()
    if not off:
        return None
    votes: dict[str, Counter] = defaultdict(Counter)
    for s in subs:
        for p in s.party_votes:
            votes[p["party"].strip().upper()][p["votes"]] += 1
    official = {p["party"].strip().upper(): p["votes"] for p in off.party_votes}
    rows = {}
    for party in sorted(set(votes) | set(official)):
        wall = votes[party].most_common(1)[0][0] if votes.get(party) else None
        o = official.get(party)
        rows[party] = {"wall": wall, "official": o, "match": wall is not None and o is not None and wall == o,
                       "difference": (o - wall) if wall is not None and o is not None else None}
    compared = [r for r in rows.values() if r["wall"] is not None and r["official"] is not None]
    status = ("no_wall_submissions" if not subs else
              "matches" if compared and all(r["match"] for r in compared) and len(compared) == len(rows) else "differs")
    return {"status": status, "source": off.source, "source_url": off.source_url, "reference": off.reference,
            "entered_by": off.entered_by, "received_at": aware(off.received_at), "parties": rows}


def _official_out(o: OfficialResult) -> OfficialResultOut:
    out = OfficialResultOut.model_validate(o)
    out.created_at, out.received_at = aware(o.created_at), aware(o.received_at)
    return out


official_router = APIRouter(prefix="/official-results", tags=["official results"])


@official_router.post("", response_model=OfficialResultReceipt, status_code=201)
def enter_official_result(body: OfficialResultIn, x_observer_key: str | None = Header(None), db: Session = Depends(get_db)):
    """Record an officially published result (IReV / collation / announcement). Accredited observers only."""
    key = get_settings().observer_key
    if not key:
        raise HTTPException(503, "Official-result entry is not enabled on this server")
    if not x_observer_key or not hmac.compare_digest(x_observer_key, key):
        raise HTTPException(401, "Observer key required")
    payload = body.model_dump(mode="json")
    content_hash = sha256_json(payload)
    existing = db.get(OfficialResult, body.id)
    if existing:
        if existing.content_hash != content_hash:
            raise HTTPException(409, "A different official result already exists with this ID")
        return OfficialResultReceipt(official=_official_out(existing),
                                     receipt=sign_receipt(existing.id, content_hash, aware(existing.received_at), duplicate=True))
    o = OfficialResult(**{**body.model_dump(), "party_votes": payload["party_votes"]},
                       reference=make_reference("official", body.id, aware(body.created_at)),
                       content_hash=content_hash, received_at=utcnow())
    db.add(o)
    audit.append(db, "official.received", "official_result", o.id,
                 {"pu": o.polling_unit_code, "source": o.source, "hash": content_hash})
    db.commit()
    return OfficialResultReceipt(official=_official_out(o), receipt=sign_receipt(o.id, content_hash, o.received_at))


@official_router.get("", response_model=list[OfficialResultOut])
def list_official_results(polling_unit_code: str | None = None, limit: int = Query(50, le=200), db: Session = Depends(get_db)):
    q = select(OfficialResult).order_by(OfficialResult.received_at.desc()).limit(limit)
    if polling_unit_code:
        q = q.where(OfficialResult.polling_unit_code == polling_unit_code)
    return [_official_out(o) for o in db.scalars(q)]
