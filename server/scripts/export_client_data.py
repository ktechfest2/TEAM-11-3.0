"""Export election reference + candidate data as static JSON for the PWA (offline use).

    .venv/bin/python scripts/export_client_data.py

Writes client/public/data/elections/2027/:
  reference.json, presidential.json, governorship.json   (small; precached by the service worker)
  <senate|house_of_reps|state_assembly>/<state>.json      (loaded per state, cached on first use)
  index.json                                              (constituencies per state, counts, sources)
"""
import json
from collections import defaultdict
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
SRC = SERVER / "data/elections/2027"
DEST = SERVER.parent / "client/public/data/elections/2027"


def slim_person(p):
    if not p:
        return None
    return {k: p[k] for k in ("name", "position", "age", "gender", "remarks") if p.get(k) is not None}


def slim(e):
    out = {"sn": e["sn"], "party": e["party"], "candidate": slim_person(e["candidate"])}
    if e.get("running_mate"):
        out["running_mate"] = slim_person(e["running_mate"])
    if e.get("constituency"):
        out["constituency"] = e["constituency"]
    if e.get("court_order"):
        out["court_order"] = True
    return out


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    ref = json.loads((SRC / "reference.json").read_text())
    (DEST / "reference.json").write_text(json.dumps(ref, ensure_ascii=False, separators=(",", ":")))
    index = {"generated_from": "INEC final lists of candidates (see sources)", "elections": {}}
    for election in ("presidential", "governorship", "senate", "house_of_reps", "state_assembly"):
        f = SRC / "candidates" / f"{election}.json"
        if not f.exists():
            continue
        data = json.loads(f.read_text())
        by_state = defaultdict(list)
        sources = {}
        for e in data["entries"]:
            by_state[e["state"]].append(slim(e))
            sources[e["state"]] = e["source"]
        info = {"notes": data.get("notes", []), "states": {}}
        for state, entries in by_state.items():
            consts = sorted({e.get("constituency") for e in entries if e.get("constituency")})
            info["states"][state] = {"count": len(entries), "constituencies": consts, "source": sources[state]}
        index["elections"][election] = info
        if election in ("presidential", "governorship"):
            (DEST / f"{election}.json").write_text(json.dumps(
                {"states": by_state, "sources": sources}, ensure_ascii=False, separators=(",", ":")))
        else:
            (DEST / election).mkdir(exist_ok=True)
            for state, entries in by_state.items():
                (DEST / election / f"{state}.json").write_text(json.dumps(
                    {"entries": entries, "source": sources[state]}, ensure_ascii=False, separators=(",", ":")))
    (DEST / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
    total = sum(p.stat().st_size for p in DEST.rglob("*.json"))
    print(f"exported to {DEST} ({total / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
