from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.session import get_db
from models import ResultSubmission
from routes.deps import aware, utcnow
from schemas.result import ResultIn, ResultOut, ResultReceipt
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
        # No official-results source is connected yet; we never fabricate one.
        "official_result": None,
        "official_result_note": "Official result source not connected. Compare manually against INEC IReV.",
        "generated_at": utcnow(),
    }
