"""Election reference data and official candidate lists (parsed from INEC final-list PDFs)."""
import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

DATA = Path(__file__).resolve().parent.parent / "data" / "elections"
ELECTIONS = {"presidential", "senate", "house_of_reps", "governorship", "state_assembly"}

router = APIRouter(prefix="/elections", tags=["elections"])


@lru_cache
def _load(year: str, name: str):
    p = DATA / year / name
    if not p.exists():
        return None
    return json.loads(p.read_text())


@router.get("/{year}")
def reference(year: str):
    ref = _load(year, "reference.json")
    if ref is None:
        raise HTTPException(404, "No reference data for this election year")
    return ref


@router.get("/{year}/candidates")
def candidates(year: str, election: str = Query(...), state: str | None = None, constituency: str | None = None):
    if election not in ELECTIONS:
        raise HTTPException(422, f"election must be one of {sorted(ELECTIONS)}")
    data = _load(year, f"candidates/{election}.json")
    if data is None:
        raise HTTPException(404, "Candidate list not yet available for this election")
    entries = data["entries"]
    if state:
        entries = [e for e in entries if e["state"] == state]
    if constituency:
        entries = [e for e in entries if (e.get("constituency") or "").lower() == constituency.lower()]
    return {"election": election, "state": state, "constituency": constituency, "notes": data.get("notes", []),
            "count": len(entries), "entries": entries}
