"""Native-speaker contribution workflow + the public language data it produces.

Contributor endpoints (bearer token):  /api/contrib/...
Public endpoints (no auth):             /api/i18n/{lang}, /api/voice/{lang}/pack, /api/languages/stats
Only APPROVED material (reviewed by a different person than the author) is ever published.
"""
import hashlib
import json
import struct
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import get_settings
from database.session import get_db
from models import Contributor, Evaluation, Recording, Translation
from security.contributors import current_contributor, require_language, require_reviewer

router = APIRouter(tags=["languages"])
LANG_RE = r"^[a-z]{2,3}$"
KEY_RE = r"^[A-Za-z0-9_.\-]{1,80}$"
MAX_WAV_BYTES = 2 * 1024 * 1024
VALIDATED_ACCURACY = 0.90
MIN_HELD_OUT_SPEAKERS = 5
MIN_EVAL_ATTEMPTS = 100


def now():
    return datetime.now(UTC).replace(microsecond=0)


# ------------------------------------------------------------------ contributor identity
@router.get("/contrib/me")
def me(c: Contributor = Depends(current_contributor)):
    return {"id": c.id, "name": c.name, "role": c.role, "languages": c.languages}


# ------------------------------------------------------------------ translations
class TranslationIn(BaseModel):
    lang: str = Field(pattern=LANG_RE)
    key: str = Field(pattern=KEY_RE)
    text: str = Field(min_length=1, max_length=2000)
    source_text: str = Field(min_length=1, max_length=2000)


class ReviewIn(BaseModel):
    approve: bool
    note: str | None = Field(None, max_length=500)


def _t_out(t: Translation, names: dict[int, str]):
    return {"id": t.id, "key": t.key, "text": t.text, "source_text": t.source_text, "status": t.status,
            "author": names.get(t.author_id), "author_id": t.author_id, "reviewer": names.get(t.reviewer_id),
            "review_note": t.review_note, "created_at": t.created_at}


@router.get("/contrib/translations")
def list_translations(lang: str, c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    require_language(c, lang)
    rows = list(db.scalars(select(Translation).where(Translation.lang == lang).order_by(Translation.id)))
    names = {x.id: x.name for x in db.scalars(select(Contributor))}
    by_key: dict[str, dict] = defaultdict(lambda: {"approved": None, "pending": []})
    for t in rows:
        if t.status == "approved":
            by_key[t.key]["approved"] = _t_out(t, names)  # rows are in id order: last approved wins
        elif t.status == "draft":
            by_key[t.key]["pending"].append(_t_out(t, names))
    return {"lang": lang, "keys": by_key}


@router.post("/contrib/translations", status_code=201)
def propose_translation(body: TranslationIn, c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    require_language(c, body.lang)
    t = Translation(lang=body.lang, key=body.key, text=body.text.strip(), source_text=body.source_text,
                    status="draft", author_id=c.id, created_at=now())
    db.add(t)
    db.commit()
    return {"id": t.id, "status": t.status}


@router.post("/contrib/translations/{tid}/review")
def review_translation(tid: int, body: ReviewIn, c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    t = db.get(Translation, tid)
    if not t:
        raise HTTPException(404, "Translation not found")
    require_reviewer(c, t.lang)
    if t.author_id == c.id:
        raise HTTPException(403, "A translation must be reviewed by someone other than its author")
    if t.status != "draft":
        raise HTTPException(409, f"Already {t.status}")
    t.status = "approved" if body.approve else "rejected"
    t.reviewer_id, t.review_note, t.reviewed_at = c.id, body.note, now()
    db.commit()
    return {"id": t.id, "status": t.status}


@router.get("/i18n/{lang}")
def published_translations(lang: str, db: Session = Depends(get_db)):
    """Approved translations only (public; the PWA caches these for offline use)."""
    rows = db.scalars(select(Translation).where(Translation.lang == lang, Translation.status == "approved").order_by(Translation.id))
    messages, sources, updated = {}, {}, None
    for t in rows:
        messages[t.key], sources[t.key] = t.text, t.source_text
        updated = max(updated, t.reviewed_at) if updated else t.reviewed_at
    return {"lang": lang, "updated_at": updated, "messages": messages, "source_texts": sources}


# ------------------------------------------------------------------ recordings
class RecordingMeta(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    lang: str = Field(pattern=LANG_RE)
    kind: str = Field(pattern=r"^(prompt|command)$")
    key: str = Field(pattern=KEY_RE)
    transcript: str = Field(min_length=1, max_length=500)
    duration_ms: int = Field(ge=200, le=15000)
    consent: bool
    features: dict | None = None  # {"frames": int, "coeffs": int, "data": [..]} for commands


def check_wav(data: bytes):
    """Accept only 16 kHz mono 16-bit PCM WAV (what the AwaVote recorder produces)."""
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise HTTPException(415, "Audio must be a WAV file")
    fmt = data.find(b"fmt ")
    if fmt < 0:
        raise HTTPException(415, "Malformed WAV")
    audio_format, channels, rate = struct.unpack("<HHI", data[fmt + 8:fmt + 16])
    bits = struct.unpack("<H", data[fmt + 22:fmt + 24])[0]
    if (audio_format, channels, rate, bits) != (1, 1, 16000, 16):
        raise HTTPException(415, "Audio must be 16 kHz mono 16-bit PCM")


@router.post("/contrib/recordings", status_code=201)
async def upload_recording(metadata: str = Form(...), file: UploadFile = File(...),
                           c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    try:
        meta = RecordingMeta.model_validate(json.loads(metadata))
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(422, f"Invalid metadata: {e}") from e
    require_language(c, meta.lang)
    if not meta.consent:
        raise HTTPException(422, "The speaker's consent is required to store a recording")
    if meta.kind == "command" and not meta.features:
        raise HTTPException(422, "Command recordings must include their feature template")
    data = await file.read(MAX_WAV_BYTES + 1)
    if len(data) > MAX_WAV_BYTES:
        raise HTTPException(413, "Recording too long")
    check_wav(data)
    existing = db.get(Recording, meta.id)
    digest = hashlib.sha256(data).hexdigest()
    if existing:
        if existing.sha256 != digest:
            raise HTTPException(409, "A different recording already exists with this ID")
        return {"id": existing.id, "status": existing.status, "duplicate": True}
    rel = Path("recordings") / meta.lang / meta.kind / f"{meta.id}.wav"
    dest = get_settings().storage_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    r = Recording(id=meta.id, lang=meta.lang, kind=meta.kind, key=meta.key, transcript=meta.transcript.strip(),
                  speaker_id=c.id, storage_path=str(rel), sha256=digest, duration_ms=meta.duration_ms,
                  features=meta.features, consent=True, status="pending", created_at=now())
    db.add(r)
    db.commit()
    return {"id": r.id, "status": r.status, "duplicate": False}


@router.get("/contrib/recordings")
def list_recordings(lang: str, kind: str | None = None, status: str | None = None,
                    c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    require_language(c, lang)
    q = select(Recording).where(Recording.lang == lang).order_by(Recording.created_at.desc())
    if kind:
        q = q.where(Recording.kind == kind)
    if status:
        q = q.where(Recording.status == status)
    names = {x.id: x.name for x in db.scalars(select(Contributor))}
    return [{"id": r.id, "kind": r.kind, "key": r.key, "transcript": r.transcript, "speaker": names.get(r.speaker_id),
             "speaker_id": r.speaker_id, "duration_ms": r.duration_ms, "status": r.status, "created_at": r.created_at}
            for r in db.scalars(q.limit(500))]


@router.get("/contrib/recordings/{rid}/audio")
def recording_audio_for_review(rid: str, c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    r = db.get(Recording, rid)
    if not r:
        raise HTTPException(404, "Recording not found")
    require_language(c, r.lang)
    return FileResponse(get_settings().storage_dir / r.storage_path, media_type="audio/wav")


@router.post("/contrib/recordings/{rid}/review")
def review_recording(rid: str, body: ReviewIn, c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    r = db.get(Recording, rid)
    if not r:
        raise HTTPException(404, "Recording not found")
    require_reviewer(c, r.lang)
    if r.speaker_id == c.id:
        raise HTTPException(403, "A recording must be reviewed by someone other than the speaker")
    r.status = "approved" if body.approve else "rejected"
    r.reviewer_id = c.id
    db.commit()
    return {"id": r.id, "status": r.status}


@router.get("/voice/{lang}/recordings/{rid}.wav")
def public_recording(lang: str, rid: str, db: Session = Depends(get_db)):
    r = db.get(Recording, rid)
    if not r or r.lang != lang or r.status != "approved":
        raise HTTPException(404, "Not found")
    return FileResponse(get_settings().storage_dir / r.storage_path, media_type="audio/wav",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/voice/{lang}/pack")
def voice_pack(lang: str, db: Session = Depends(get_db)):
    """Approved command templates (features only) + approved spoken prompts, for on-device use."""
    rows = list(db.scalars(select(Recording).where(Recording.lang == lang, Recording.status == "approved").order_by(Recording.id)))
    commands = [{"id": r.id, "intent": r.key, "speaker": r.speaker_id, "features": r.features} for r in rows if r.kind == "command"]
    prompts: dict[str, str] = {}
    for r in rows:
        if r.kind == "prompt":
            prompts[r.key] = f"/api/voice/{lang}/recordings/{r.id}.wav"  # latest approved wins
    version = hashlib.sha256("|".join(r.id for r in rows).encode()).hexdigest()[:12]
    return {"lang": lang, "version": version, "commands": commands, "prompts": prompts,
            "speakers": len({c["speaker"] for c in commands})}


# ------------------------------------------------------------------ evaluations
class EvaluationIn(BaseModel):
    lang: str = Field(pattern=LANG_RE)
    recognizer: str = Field(max_length=40)
    pack_version: str = Field(max_length=40)
    expected: str = Field(pattern=KEY_RE)
    predicted: str | None = Field(None, max_length=40)
    confidence: float | None = Field(None, ge=0, le=1)


@router.post("/contrib/evaluations", status_code=201)
def record_evaluation(body: EvaluationIn, c: Contributor = Depends(current_contributor), db: Session = Depends(get_db)):
    require_language(c, body.lang)
    e = Evaluation(**body.model_dump(), speaker_id=c.id, correct=body.predicted == body.expected, created_at=now())
    db.add(e)
    db.commit()
    return {"id": e.id, "correct": e.correct}


def language_stats(db: Session) -> dict:
    out: dict[str, dict] = defaultdict(lambda: {"translations_approved": 0, "translations_pending": 0, "prompts_approved": 0,
                                                "command_templates": 0, "command_speakers": 0,
                                                "evaluation": {"held_out_attempts": 0, "held_out_speakers": 0, "accuracy": None}})
    latest: dict[tuple, str] = {}
    for t in db.scalars(select(Translation).order_by(Translation.id)):
        if t.status in ("approved", "draft"):
            latest.setdefault((t.lang, t.key, t.status), t.text)
    for (lang, _key, status) in latest:
        out[lang]["translations_approved" if status == "approved" else "translations_pending"] += 1
    template_speakers: dict[str, set] = defaultdict(set)
    prompt_keys: dict[str, set] = defaultdict(set)
    for r in db.scalars(select(Recording).where(Recording.status == "approved")):
        if r.kind == "command":
            out[r.lang]["command_templates"] += 1
            template_speakers[r.lang].add(r.speaker_id)
        else:
            prompt_keys[r.lang].add(r.key)
    for lang, s in template_speakers.items():
        out[lang]["command_speakers"] = len(s)
    for lang, k in prompt_keys.items():
        out[lang]["prompts_approved"] = len(k)
    evals: dict[str, list] = defaultdict(list)
    for e in db.scalars(select(Evaluation)):
        if e.speaker_id not in template_speakers[e.lang]:  # held-out speakers only
            evals[e.lang].append(e)
    for lang, es in evals.items():
        acc = sum(e.correct for e in es) / len(es)
        speakers = len({e.speaker_id for e in es})
        out[lang]["evaluation"] = {
            "held_out_attempts": len(es), "held_out_speakers": speakers, "accuracy": round(acc, 3),
            "validated": acc >= VALIDATED_ACCURACY and speakers >= MIN_HELD_OUT_SPEAKERS and len(es) >= MIN_EVAL_ATTEMPTS,
        }
    return out


@router.get("/languages/stats")
def stats(db: Session = Depends(get_db)):
    return {"criteria": {"accuracy": VALIDATED_ACCURACY, "min_held_out_speakers": MIN_HELD_OUT_SPEAKERS,
                         "min_attempts": MIN_EVAL_ATTEMPTS},
            "languages": language_stats(db), "generated_at": now()}

