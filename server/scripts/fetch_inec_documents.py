"""Download the official INEC candidate-list PDFs listed in data/inec/sources_2027.json.

    .venv/bin/python scripts/fetch_inec_documents.py

Files are stored as data/inec/raw/<election>/<state>.pdf with a fetch log recording each
document's URL, SHA-256 and fetch time, so every candidate shown in AwaVote can be
traced back to the exact official file it came from. Re-running skips files already present.
"""
import hashlib
import json
import sys
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "inec"
RAW = DATA / "raw"
LOG = DATA / "fetch_log.json"
UA = "AwaVote-civic-data-fetcher/0.1"


def fetch(url: str, attempts: int = 6) -> bytes:
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            if not data.startswith(b"%PDF"):
                raise ValueError("response is not a PDF")
            return data
        except Exception as e:  # network here is unreliable; back off and retry
            last = e
            time.sleep(min(30, 2 ** i))
    raise RuntimeError(f"failed after {attempts} attempts: {last}")


def main():
    manifest = json.loads((DATA / "sources_2027.json").read_text())
    log = json.loads(LOG.read_text()) if LOG.exists() else {}
    failed = []
    for doc in manifest["documents"]:
        dest = RAW / doc["election"] / f"{doc['state']}.pdf"
        if dest.exists() and doc["url"] in log:
            continue
        try:
            data = fetch(doc["url"])
        except RuntimeError as e:
            failed.append((doc["url"], str(e)))
            print("FAIL", doc["election"], doc["state"], e, file=sys.stderr)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        log[doc["url"]] = {"path": str(dest.relative_to(DATA)), "sha256": hashlib.sha256(data).hexdigest(),
                           "bytes": len(data), "fetched_at": datetime.now(UTC).isoformat(timespec="seconds")}
        LOG.write_text(json.dumps(log, indent=1))
        print("ok", doc["election"], doc["state"], len(data))
    print(f"done: {len(log)} documents on disk, {len(failed)} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
