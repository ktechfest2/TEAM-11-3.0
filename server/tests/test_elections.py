import json
import shutil
from pathlib import Path

import pytest

from tests.conftest import SERVER

RAW = SERVER / "data/inec/raw/presidential/nigeria.pdf"
needs_pdf = pytest.mark.skipif(not RAW.exists() or not shutil.which("pdftotext"),
                               reason="INEC PDF not downloaded (run scripts/fetch_inec_documents.py) or poppler missing")


@needs_pdf
def test_presidential_list_matches_inec_document():
    import sys
    sys.path.insert(0, str(SERVER / "scripts"))
    import parse_inec_candidates as p

    groups, problems, signed = p.parse_document(RAW)
    entries = {e["party"]: e for e in p.normalise(groups, "presidential", "nigeria", {})}
    assert problems == [] and signed
    assert len(entries) == 19  # INEC's final list (30 Oct 2026) has 19 entries, not the 18 widely reported
    assert entries["APC"]["candidate"]["name"] == "TINUBU BOLA AHMED"
    assert entries["APC"]["running_mate"]["name"] == "SHETTIMA KASHIM"
    assert entries["NDC"]["running_mate"]["name"] == "MUSA MOHAMMED RABIU KWANKWASO"  # wrapped across lines
    assert entries["PRP"]["running_mate"]["name"] == "MOHAMMED SULE"  # press reports got this wrong
    assert entries["A"]["candidate"]["name"] is None and "COURT ORDER" in entries["A"]["candidate"]["remarks"]
    assert entries["ADC"]["candidate"]["age"] == 79 and entries["ADC"]["candidate"]["gender"] == "M"


def test_reference_endpoint(client):
    r = client.get("/api/elections/2027").json()
    assert {e["id"]: e["date"] for e in r["elections"]}["presidential"] == "2027-01-16"
    assert {e["id"]: e["date"] for e in r["elections"]}["governorship"] == "2027-02-06"
    assert len(r["parties"]["registered"]) == 22
    assert sum(s["governorship_2027"] for s in r["states"]) == 28


def test_candidates_endpoint_filters(client):
    data_file = SERVER / "data/elections/2027/candidates/governorship.json"
    if not data_file.exists():
        pytest.skip("candidate data not generated")
    r = client.get("/api/elections/2027/candidates", params={"election": "governorship", "state": "lagos"}).json()
    assert r["count"] > 0 and all(e["state"] == "lagos" for e in r["entries"])
    assert all(e["source"]["url"].startswith("https://www.inecnigeria.org/") for e in r["entries"])
    assert client.get("/api/elections/2027/candidates", params={"election": "mayor"}).status_code == 422


def test_result_party_must_be_registered(client):
    import uuid
    base = {"created_at": "2026-11-18T10:00:00Z", "election_type": "governorship", "polling_unit_code": "PU-1",
            "total_valid_votes": 10}
    ok = client.post("/api/results", json={**base, "id": str(uuid.uuid4()), "party_votes": [{"party": "LP", "votes": 10}]})
    assert ok.status_code == 201, ok.text
    bad = client.post("/api/results", json={**base, "id": str(uuid.uuid4()), "party_votes": [{"party": "XYZ", "votes": 10}]})
    assert bad.status_code == 422
