"""Registry of the on-device speech models this AwaVote server hosts."""
import json

from fastapi import APIRouter

from core.config import get_settings

router = APIRouter(prefix="/speech", tags=["speech"])


@router.get("/models")
def speech_models():
    """Models listed in data/models/registry.json (written by ai/speech_to_text/convert_natlas.py).
    Each entry: {id, languages, size_bytes, base, license, attribution, language_token}."""
    reg = get_settings().models_dir / "registry.json"
    if not reg.exists():
        return {"models": []}
    return json.loads(reg.read_text())
