"""Create a contributor and print their access token (shown once).

    .venv/bin/python scripts/add_contributor.py "Amina Bello" --langs ha ff --role reviewer
"""
import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.session import SessionLocal  # noqa: E402
from models import Contributor  # noqa: E402
from security.contributors import new_token  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("name")
ap.add_argument("--langs", nargs="+", required=True)
ap.add_argument("--role", choices=["translator", "reviewer", "admin"], default="translator")
a = ap.parse_args()
token, h = new_token()
with SessionLocal() as db:
    c = Contributor(name=a.name, languages=a.langs, role=a.role, token_hash=h, created_at=datetime.now(UTC))
    db.add(c)
    db.commit()
    print(f"Created contributor #{c.id} {a.name} ({a.role}; {', '.join(a.langs)})")
print(f"Access token (give it to them privately; it is not stored and cannot be shown again):\n{token}")
