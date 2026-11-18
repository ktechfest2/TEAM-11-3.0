from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.session import get_db
from models import Evidence, Incident, ResultSubmission
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
        "official_results": {"connected": False, "note": "No official results feed is connected."},
    }
