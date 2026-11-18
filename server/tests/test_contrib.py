import io
import json
import struct
import uuid
from datetime import UTC, datetime

import pytest

from models import Contributor
from security.contributors import new_token


def wav(seconds=1.0, rate=16000):
    n = int(seconds * rate)
    data = b"\x00\x00" * n
    return (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(data)) + data)


@pytest.fixture()
def people(client):
    out = {}
    with client.session_factory() as db:
        for name, role, langs in [("ada", "translator", ["tiv"]), ("ben", "reviewer", ["tiv"]), ("cy", "translator", ["ha"])]:
            token, h = new_token()
            db.add(Contributor(name=name, role=role, languages=langs, token_hash=h, created_at=datetime.now(UTC)))
            out[name] = {"Authorization": f"Bearer {token}"}
        db.commit()
    return out


def test_requires_token(client):
    assert client.get("/api/contrib/me").status_code == 401
    assert client.get("/api/contrib/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_translation_needs_independent_review_before_publishing(client, people):
    r = client.post("/api/contrib/translations", headers=people["ada"],
                    json={"lang": "tiv", "key": "nav.home", "text": "Ya", "source_text": "Home"})
    tid = r.json()["id"]
    assert client.get("/api/i18n/tiv").json()["messages"] == {}  # drafts are never published
    assert client.post(f"/api/contrib/translations/{tid}/review", headers=people["ada"], json={"approve": True}).status_code == 403
    assert client.post(f"/api/contrib/translations/{tid}/review", headers=people["ben"], json={"approve": True}).status_code == 200
    assert client.get("/api/i18n/tiv").json()["messages"] == {"nav.home": "Ya"}


def test_contributor_limited_to_their_languages(client, people):
    r = client.post("/api/contrib/translations", headers=people["cy"],
                    json={"lang": "tiv", "key": "nav.home", "text": "x", "source_text": "Home"})
    assert r.status_code == 403


def _upload(client, headers, kind="command", key="nav.countcam", consent=True, audio=None):
    meta = {"id": str(uuid.uuid4()), "lang": "tiv", "kind": kind, "key": key, "transcript": "...", "duration_ms": 1000,
            "consent": consent, "features": {"frames": 2, "coeffs": 2, "data": [0, 1, 2, 3]} if kind == "command" else None}
    return client.post("/api/contrib/recordings", headers=headers, data={"metadata": json.dumps(meta)},
                       files={"file": ("a.wav", io.BytesIO(audio or wav()), "audio/wav")}), meta


def test_recording_validation(client, people):
    assert _upload(client, people["ada"], consent=False)[0].status_code == 422
    assert _upload(client, people["ada"], audio=wav(rate=44100))[0].status_code == 415
    assert _upload(client, people["ada"], audio=b"not audio" * 10)[0].status_code == 415


def test_voice_pack_and_held_out_accuracy(client, people):
    r, meta = _upload(client, people["ada"])
    assert r.status_code == 201
    assert client.get("/api/voice/tiv/pack").json()["commands"] == []  # pending: not published
    client.post(f"/api/contrib/recordings/{meta['id']}/review", headers=people["ben"], json={"approve": True})
    pack = client.get("/api/voice/tiv/pack").json()
    assert len(pack["commands"]) == 1 and pack["speakers"] == 1
    assert client.get(f"/api/voice/tiv/recordings/{meta['id']}.wav").status_code == 200
    # ada provided templates, so her test attempts must NOT count; ben is a held-out speaker.
    ev = {"lang": "tiv", "recognizer": "templates-v1", "pack_version": pack["version"], "expected": "nav.countcam"}
    client.post("/api/contrib/evaluations", headers=people["ada"], json={**ev, "predicted": "nav.countcam"})
    client.post("/api/contrib/evaluations", headers=people["ben"], json={**ev, "predicted": "nav.countcam"})
    client.post("/api/contrib/evaluations", headers=people["ben"], json={**ev, "predicted": "nav.home"})
    s = client.get("/api/languages/stats").json()["languages"]["tiv"]
    assert s["evaluation"]["held_out_attempts"] == 2
    assert s["evaluation"]["accuracy"] == 0.5
    assert s["evaluation"]["validated"] is False
