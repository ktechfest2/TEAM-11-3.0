"""Parse INEC 'final list of candidates' PDFs into structured JSON.

    .venv/bin/python scripts/parse_inec_candidates.py            # all downloaded documents
    .venv/bin/python scripts/parse_inec_candidates.py --check    # print per-document stats only

Requires poppler's `pdftotext` (word bounding boxes via -bbox).

Why coordinates instead of plain text: the PDFs are pdfmake tables whose cells wrap and
are vertically centred, and the column order differs per document type (PARTY is column 2
in the presidential list and column 5 in governorship lists). Plain text extraction
scrambles multi-line names. Approach:
  1. drop the large "CENI" watermark glyphs (by glyph height) and the signature block,
  2. find the header row on each page and derive column boundaries from it,
  3. merge vertically adjacent lines in a column into cells,
  4. anchor one candidate per POSITION cell and attach the nearest cell of every other column,
  5. attach SN/PARTY (which span the principal + deputy rows) to the record group.

Output: data/elections/2027/candidates/<election>.json, each candidate carrying the source
URL and SHA-256 of the INEC document it came from. Parse problems are reported, never guessed.
"""
import html
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INEC = ROOT / "data" / "inec"
OUT = ROOT / "data" / "elections" / "2027" / "candidates"

WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE_RE = re.compile(r"<page ")
MAX_GLYPH_H = 20      # watermark letters are ~250pt tall
CELL_GAP = 8.0        # whitespace between lines of the same cell is ~5.5pt; between rows >= ~10pt
SIGNATURE = {"Signed:", "Rose", "Oriaran-Anthony", "Secretary,", "INEC"}

FIELD_ALIASES = {
    "SN": "sn", "PARTY": "party", "STATE": "state", "POSITION": "position",
    "NAME OF CANDIDATE": "name", "PWD": "pwd", "AGE": "age", "GENDER": "gender",
    "QUALIFICATION(S)": "qualifications", "QUALIFICATIONS": "qualifications", "REMARKS": "remarks",
}


def words_by_page(pdf: Path):
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages = PAGE_RE.split(out)[1:]
    for page in pages:
        ws = []
        for m in WORD_RE.finditer(page):
            x0, y0, x1, y1 = map(float, m.groups()[:4])
            if y1 - y0 > MAX_GLYPH_H:
                continue
            ws.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t": html.unescape(m.group(5))})
        yield ws


def header_columns(words):
    """Columns from the header row: [(label, x_left_boundary, x_right_boundary)]."""
    sn = [w for w in words if w["t"] == "SN"]
    if not sn:
        return None, None
    hy = sn[0]["y0"]
    # The header can wrap onto 2 lines ("NAME OF / CANDIDATE"), so the header region ends just
    # above the first data row, i.e. the first numeric SN below the header.
    sn_right = sn[0]["x1"] + 10
    first_row = min((w["y0"] for w in words if w["t"].isdigit() and w["x0"] < sn_right and w["y0"] > hy + 2), default=hy + 14)
    hdr = sorted((w for w in words if hy - 2 <= w["y0"] < first_row - 2), key=lambda w: (w["x0"], w["y0"]))
    # Group header words into labels: same label if horizontally close (handles 2-line labels too).
    labels = []
    for w in hdr:
        if labels and (w["x0"] - labels[-1]["x1"] < 6 or w["x0"] < labels[-1]["x1"]):
            labels[-1]["words"].append(w)
            labels[-1]["x1"] = max(labels[-1]["x1"], w["x1"])
        else:
            labels.append({**w, "words": [w]})
    for l in labels:  # read a wrapped label top-to-bottom, left-to-right
        l["t"] = " ".join(x["t"] for x in sorted(l["words"], key=lambda x: (round(x["y0"]), x["x0"])))
    cols = []
    for i, l in enumerate(labels):
        left = -1e9 if i == 0 else (labels[i - 1]["x1"] + l["x0"]) / 2
        right = 1e9 if i == len(labels) - 1 else (l["x1"] + labels[i + 1]["x0"]) / 2
        key = FIELD_ALIASES.get(l["t"].upper(), re.sub(r"\W+", "_", l["t"].lower()).strip("_"))
        cols.append((key, left, right))
    header_bottom = max(w["y1"] for w in hdr)
    return cols, header_bottom


def cells(words, cols, top, breaks=()):
    """Group body words into cells per column. A cell never spans across a y in `breaks`
    (the tops of anchor rows), so a wrapped name cannot merge into the next row's name."""
    by_col = defaultdict(list)
    for w in words:
        if w["y0"] <= top or w["t"] in SIGNATURE:
            continue
        cx = (w["x0"] + w["x1"]) / 2
        for key, l, r in cols:
            if l <= cx < r:
                by_col[key].append(w)
                break
    result = {}
    for key, ws in by_col.items():
        # lines first (same y), then merge lines that are vertically adjacent into cells
        ws.sort(key=lambda w: (round(w["y0"], 1), w["x0"]))
        lines = []
        for w in ws:
            if lines and abs(lines[-1]["y0"] - w["y0"]) < 2:
                lines[-1]["t"] += " " + w["t"]
                lines[-1]["y1"] = max(lines[-1]["y1"], w["y1"])
            else:
                lines.append(dict(w))
        blocks = []
        for ln in lines:
            crosses = blocks and any(blocks[-1]["last_y0"] < b <= ln["y0"] + 1 for b in breaks)
            if blocks and ln["y0"] - blocks[-1]["y1"] < CELL_GAP and not crosses:
                blocks[-1]["t"] += " " + ln["t"]
                blocks[-1]["y1"] = ln["y1"]
                blocks[-1]["last_y0"] = ln["y0"]
            else:
                blocks.append({"t": ln["t"], "y0": ln["y0"], "y1": ln["y1"], "last_y0": ln["y0"]})
        for b in blocks:
            b["c"] = (b["y0"] + b["y1"]) / 2
        result[key] = blocks
    return result


def clean_name(s: str):
    """Join names hyphen-wrapped across lines ("UDUAK- OBONG" -> "UDUAK-OBONG")."""
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"-\s+", "-", s) or None


def clean_constituency(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*/\s*", "/", s)
    return re.sub(r"-\s+", "-", s)


def fix_hyphen(s: str) -> str:
    return re.sub(r"-\s+", "-", s).strip()


POSITION_LABEL = {"senate": "Senate", "house_of_reps": "House of Representatives", "state_assembly": "State House of Assembly"}


def parse_document(pdf: Path, default_position: str = "Candidate"):
    records, problems = [], []
    signature_seen = False
    for pno, words in enumerate(words_by_page(pdf), 1):
        cols, top = header_columns(words)
        if not cols:
            if words:
                problems.append(f"page {pno}: no header row found")
            continue
        signature_seen = signature_seen or any(w["t"] == "Oriaran-Anthony" for w in words)
        cmap = cells(words, cols, top)
        anchor_col = "position" if "position" in cmap else "sn"
        row_tops = [b["y0"] for b in cmap.get(anchor_col, []) if anchor_col == "position" or b["t"].strip().isdigit()]
        cmap = {**cells(words, cols, top, breaks=row_tops), anchor_col: cmap.get(anchor_col, [])}
        # Presidential/governorship tables have a POSITION column with two rows per entry
        # (candidate + running mate). Senate/Reps/Assembly tables have one row per candidate
        # and no POSITION column, so each SN cell is the anchor.
        anchor_key = "position" if "position" in cmap else "sn"
        anchors = sorted((b for b in cmap.get(anchor_key, []) if anchor_key == "position" or b["t"].strip().isdigit()),
                         key=lambda b: b["c"])
        if not anchors:
            continue
        rows = [{anchor_key: fix_hyphen(a["t"]), "_c": a["c"], "_y0": a["y0"], "_y1": a["y1"]} for a in anchors]
        if anchor_key == "sn":
            for r in rows:
                r["position"] = default_position
        for key, blocks in cmap.items():
            if key == anchor_key:
                continue
            for b in blocks:
                # nearest anchor whose vertical band overlaps or is closest to this cell's centre
                best = min(rows, key=lambda r: abs(r["_c"] - b["c"]))
                if key in best:
                    best[key] += " " + b["t"]
                else:
                    best[key] = b["t"]
        records.extend(rows)
    # Group: an SN starts a new contest entry; following rows without SN are running mates/deputies.
    groups, cur = [], None
    for r in records:
        if r.get("sn", "").strip().isdigit():
            cur = {"sn": int(r["sn"].strip()), "rows": [r]}
            groups.append(cur)
        elif cur is not None:
            cur["rows"].append(r)
        else:
            problems.append(f"row before first SN: {r.get('name')}")
    return groups, problems, signature_seen


REMARK_RE = re.compile(r"COURT\s+ORDER|CONSTITU\w*\s+SWAP|SUBSTITUT\w*|WITHDR\w*|DISQUALIF\w*|DECEASED", re.I)


def remark(text: str):
    """Keep only recognisable INEC remarks (e.g. COURT ORDER); ignore spilled-over text."""
    found = REMARK_RE.findall(re.sub(r"\s+", " ", text))
    return " / ".join(dict.fromkeys(f.upper() for f in found)) or None


PRINCIPAL = re.compile(r"^(Presidential|Governorship|Senat|House|Member|State|Federal|Candidate)", re.I)


def normalise(groups, election, state, source):
    out = []
    for g in groups:
        party = next((r.get("party") for r in g["rows"] if r.get("party")), None)
        constituency = next((r.get(k) for r in g["rows"] for k in r if k not in {
            "sn", "party", "state", "position", "name", "pwd", "age", "gender", "qualifications", "remarks"} and not k.startswith("_") and r.get(k)), None)
        people = []
        for r in g["rows"]:
            # Like GENDER, the AGE cell can pick up spilled-over text; take the standalone number.
            age = next((t for t in (r.get("age") or "").split() if t.isdigit()), "")
            people.append({
                "role": "running_mate" if not PRINCIPAL.match(r["position"]) else "candidate",
                "position": r["position"],
                "name": clean_name(r.get("name", "")),
                "age": int(age) if age.isdigit() else None,
                # The GENDER cell is a single letter; qualification text can spill into it.
                "gender": next((t for t in (r.get("gender") or "").split() if t in ("M", "F")), None),
                "pwd": (r.get("pwd") or "").strip() or None,
                # Qualifications are not extracted: long qualification text overflows into the
                # REMARKS column in these PDFs, and we never publish data we cannot parse reliably.
                "remarks": remark(r.get("remarks", "") + " " + r.get("qualifications", "")),
            })
        out.append({
            "election": election, "state": state, "sn": g["sn"],
            "party": (party or "").replace(" ", "") or None,
            "constituency": clean_constituency(constituency) if constituency else None,
            "candidate": next((p for p in people if p["role"] == "candidate"), None),
            "running_mate": next((p for p in people if p["role"] == "running_mate"), None),
            "source": source,
        })
    return out


def main():
    check_only = "--check" in sys.argv
    manifest = json.loads((INEC / "sources_2027.json").read_text())
    log = json.loads((INEC / "fetch_log.json").read_text())
    by_election = defaultdict(list)
    report = []
    for doc in manifest["documents"]:
        meta = log.get(doc["url"])
        if not meta:
            report.append({"election": doc["election"], "state": doc["state"], "status": "not_downloaded"})
            continue
        pdf = INEC / meta["path"]
        groups, problems, signed = parse_document(pdf, POSITION_LABEL.get(doc["election"], "Candidate"))
        source = {"url": doc["url"], "sha256": meta["sha256"], "fetched_at": meta["fetched_at"]}
        entries = normalise(groups, doc["election"], doc["state"], source)
        # Integrity checks: SNs must be consecutive; every entry needs party + candidate name
        # (except court-order rows, which INEC itself publishes without names).
        sns = [e["sn"] for e in entries]
        if sns != list(range(1, len(sns) + 1)) and doc["election"] in ("presidential", "governorship"):
            problems.append(f"non-consecutive SN: {sns}")
        for e in entries:
            court = any("COURT" in ((p or {}).get("remarks") or "").upper() for p in (e["candidate"], e["running_mate"]))
            if not e["party"]:
                problems.append(f"SN {e['sn']}: no party")
            if not court and not (e["candidate"] and e["candidate"]["name"]):
                problems.append(f"SN {e['sn']}: no candidate name")
            e["court_order"] = court
        if not signed:
            problems.append("signature block not found (document may be incomplete)")
        by_election[doc["election"]].extend(entries)
        report.append({"election": doc["election"], "state": doc["state"], "entries": len(entries), "problems": problems})
    for r in report:
        if r.get("status") or r["problems"] or check_only:
            print(json.dumps(r, ensure_ascii=False))
    if check_only:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for election, entries in by_election.items():
        (OUT / f"{election}.json").write_text(json.dumps({
            "election": election, "source_manifest": "server/data/inec/sources_2027.json",
            "notes": manifest["known_gaps"], "entries": entries}, indent=1, ensure_ascii=False))
    (OUT / "parse_report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print({k: len(v) for k, v in by_election.items()})


if __name__ == "__main__":
    main()
