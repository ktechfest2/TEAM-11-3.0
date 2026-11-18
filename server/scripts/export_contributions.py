"""Export approved native-speaker command transcripts for intent-model training.

    .venv/bin/python scripts/export_contributions.py   ->  ai/datasets/contributed_utterances.json
Then retrain: ai/.venv/bin/python -I ai/intent/train.py
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy import select  # noqa: E402

from database.session import SessionLocal  # noqa: E402
from models import Recording  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "ai/datasets/contributed_utterances.json"
data: dict = defaultdict(lambda: defaultdict(set))
with SessionLocal() as db:
    for r in db.scalars(select(Recording).where(Recording.kind == "command", Recording.status == "approved")):
        data[r.key][r.lang].add(r.transcript.strip())
out = {"status": "native-speaker transcripts of approved command recordings",
       "intents": {i: {l: sorted(t) for l, t in langs.items()} for i, langs in data.items()}}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(f"wrote {sum(len(t) for l in out['intents'].values() for t in l.values())} utterances to {OUT}")
