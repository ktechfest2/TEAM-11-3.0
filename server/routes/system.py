from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.session import get_db
from models import Evidence, Incident, OfficialResult, ResultSubmission
from routes.deps import utcnow
from services import audit

router = APIRouter(tags=["system"])


@router.get("/audit/verify")
def verify_audit(db: Session = Depends(get_db)):
    return audit.verify_chain(db)


@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    def grouped(col):
        return {k: v for k, v in db.execute(select(col, func.count()).group_by(col))}

    results = list(db.scalars(select(ResultSubmission)))
    validation_counts: dict[str, int] = {}
    for r in results:
        s = (r.validation or {}).get("status", "unknown")
        validation_counts[s] = validation_counts.get(s, 0) + 1
    return {
        "generated_at": utcnow(),
        "evidence": {"total": db.scalar(select(func.count()).select_from(Evidence)), "by_kind": grouped(Evidence.kind)},
        "incidents": {"total": db.scalar(select(func.count()).select_from(Incident)),
                      "by_category": grouped(Incident.category), "by_status": grouped(Incident.status)},
        "independent_results": {"total": len(results), "by_validation": validation_counts,
                                "polling_units": len({r.polling_unit_code for r in results})},
        "official_results": official_summary(db, results),
    }


def official_summary(db: Session, results: list) -> dict:
    """How many polling units have an official result entered, and how many differ from the wall."""
    from routes.results import wall_vs_official
    pus = {o.polling_unit_code for o in db.scalars(select(OfficialResult))}
    by_pu: dict[str, list] = {}
    for r in results:
        by_pu.setdefault(r.polling_unit_code, []).append(r)
    statuses = [(wall_vs_official(db, pu, None, by_pu.get(pu, [])) or {}).get("status") for pu in pus]
    return {"connected": bool(pus), "polling_units": len(pus),
            "matches": statuses.count("matches"), "differs": statuses.count("differs"),
            "note": "Official results are entered by accredited observers from INEC IReV / collation sheets, with the source link."}
