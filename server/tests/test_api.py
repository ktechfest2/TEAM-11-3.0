import hashlib
import io
import json
import uuid

from sqlalchemy import update

from models import AuditRecord

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"fake-but-signature-valid-jpeg"


def _upload(client, data=JPEG, **meta):
    meta = {"id": str(uuid.uuid4()), "kind": "result_sheet", "sha256": hashlib.sha256(data).hexdigest(),
            "captured_at": "2026-11-18T09:00:00Z", **meta}
    return client.post("/api/evidence", data={"metadata": json.dumps(meta)},
                       files={"file": ("x.jpg", io.BytesIO(data), "image/jpeg")}), meta


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_evidence_upload_and_download_preserves_bytes(client):
    r, meta = _upload(client, polling_unit_code="24-11-05-003")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["evidence"]["reference"].startswith("AWV-EV-20261118-")
    assert body["receipt"]["duplicate"] is False
    f = client.get(f"/api/evidence/{meta['id']}/file")
    assert f.content == JPEG
    assert f.headers["x-content-sha256"] == meta["sha256"]


def test_evidence_upload_is_idempotent(client):
    r1, meta = _upload(client)
    r2 = client.post("/api/evidence", data={"metadata": json.dumps(meta)},
                     files={"file": ("x.jpg", io.BytesIO(JPEG), "image/jpeg")})
    assert r2.status_code == 201
    assert r2.json()["receipt"]["duplicate"] is True
    assert len(client.get("/api/evidence").json()) == 1


def test_evidence_id_reuse_with_different_file_conflicts(client):
    _, meta = _upload(client)
    other = JPEG + b"changed"
    r = client.post("/api/evidence",
                    data={"metadata": json.dumps({**meta, "sha256": hashlib.sha256(other).hexdigest()})},
                    files={"file": ("x.jpg", io.BytesIO(other), "image/jpeg")})
    assert r.status_code == 409


def test_evidence_hash_mismatch_rejected(client):
    r, _ = _upload(client, sha256="0" * 64)
    assert r.status_code == 422
    assert "Integrity" in r.text


def test_non_image_rejected(client):
    r, _ = _upload(client, data=b"<html>not an image</html>")
    assert r.status_code == 415


def test_incident_anonymous_strips_contact(client):
    iid = str(uuid.uuid4())
    r = client.post("/api/incidents", json={"id": iid, "category": "vote_buying", "description": "Cash seen near PU",
                                            "created_at": "2026-11-18T10:00:00Z", "anonymous": True,
                                            "reporter_contact": "0800-000-0000"})
    assert r.status_code == 201, r.text
    assert r.json()["incident"]["status"] == "allegation"
    with client.session_factory() as db:
        from models import Incident
        assert db.get(Incident, iid).reporter_contact is None


def test_result_server_recomputes_validation(client):
    rid = str(uuid.uuid4())
    r = client.post("/api/results", json={"id": rid, "created_at": "2026-11-18T10:00:00Z", "election_type": "presidential",
                                          "polling_unit_code": "PU-1", "rejected_votes": 2, "total_valid_votes": 100,
                                          "party_votes": [{"party": "APC", "votes": 60}, {"party": "PDP", "votes": 30}]})
    assert r.status_code == 201, r.text
    res = r.json()["result"]
    assert res["source"] == "independent_submission"
    assert res["validation"]["status"] == "needs_review"


def test_compare_flags_disagreeing_submissions(client):
    for votes in (60, 61):
        client.post("/api/results", json={"id": str(uuid.uuid4()), "created_at": "2026-11-18T10:00:00Z",
                                          "election_type": "presidential", "polling_unit_code": "PU-9",
                                          "total_valid_votes": votes, "party_votes": [{"party": "a", "votes": votes}]})
    c = client.get("/api/results/compare/PU-9").json()
    assert c["independent_submissions"] == 2
    assert c["status"] == "needs_review"
    assert c["disagreements"] == {"A": [60, 61]}
    assert c["official_result"] is None


def test_audit_chain_detects_tampering(client):
    _upload(client)
    _upload(client)
    assert client.get("/api/audit/verify").json() == {**client.get("/api/audit/verify").json(), "valid": True}
    with client.session_factory() as db:
        db.execute(update(AuditRecord).where(AuditRecord.seq == 1).values(payload={"sha256": "tampered"}))
        db.commit()
    v = client.get("/api/audit/verify").json()
    assert v["valid"] is False and v["broken_at_seq"] == 1


def test_dashboard_summary_never_claims_official_results(client):
    s = client.get("/api/dashboard/summary").json()
    assert s["official_results"]["connected"] is False
