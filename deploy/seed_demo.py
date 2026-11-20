"""Load DEMO data so judges can try "Track a result" on a fresh server.

Every record is clearly labelled: polling-unit codes start with DEMO-, and the official entries
say "AwaVote demo data (not a real result)". Safe to run repeatedly (fixed IDs, skipped if present).
  - DEMO-001: three wall photos agree, and the announced result MATCHES.
  - DEMO-002: three wall photos (one mistyped), and the announced result DIFFERS for one party.
"""
import sys
import uuid
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parent.parent), str(Path.cwd())]  # server/: container = scripts/.., local = cwd
from fastapi.testclient import TestClient  # noqa: E402

from core.config import get_settings  # noqa: E402
from main import app  # noqa: E402

NS = uuid.UUID("6a0e5c8e-1d1f-4c2a-9a55-0b7d2a1c0001")
uid = lambda name: str(uuid.uuid5(NS, name))  # noqa: E731
TS = "2027-01-16T19:30:00Z"


def wall(c, name, pu, votes, valid):
    c.post("/api/results", json={"id": uid(name), "created_at": TS, "election_type": "presidential", "polling_unit_code": pu,
                                 "registered_voters": 750, "accredited_voters": valid + 6, "rejected_votes": 6,
                                 "total_valid_votes": valid, "total_votes_cast": valid + 6,
                                 "party_votes": [{"party": p, "votes": v} for p, v in votes.items()]})


def official(c, name, pu, votes, key):
    c.post("/api/official-results", headers={"X-Observer-Key": key}, json={
        "id": uid(name), "created_at": "2027-01-17T09:00:00Z", "election_type": "presidential", "polling_unit_code": pu,
        "source": "irev", "source_url": None, "entered_by": "AwaVote demo data (not a real result)",
        "party_votes": [{"party": p, "votes": v} for p, v in votes.items()]})


key = get_settings().observer_key or "demo-only-key"
get_settings().observer_key = key
with TestClient(app) as c:
    a = {"APC": 182, "PDP": 141, "LP": 96, "NNPP": 23}
    for i in range(3):
        wall(c, f"demo1-wall-{i}", "DEMO-001", a, sum(a.values()))
    official(c, "demo1-official", "DEMO-001", a, key)
    b = {"APC": 120, "PDP": 98, "LP": 77, "ADC": 15}
    wall(c, "demo2-wall-0", "DEMO-002", b, sum(b.values()))
    wall(c, "demo2-wall-1", "DEMO-002", b, sum(b.values()))
    wall(c, "demo2-wall-2", "DEMO-002", {**b, "LP": 71}, sum(b.values()) - 6)  # one mistyped photo
    official(c, "demo2-official", "DEMO-002", {**b, "APC": 150}, key)
    print("demo data:", c.get("/api/results/compare/DEMO-001").json()["official"]["status"],
          c.get("/api/results/compare/DEMO-002").json()["official"]["status"])
