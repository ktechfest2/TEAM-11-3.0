"""Independent checks on parsed candidate data (run after parse_inec_candidates.py)."""
import json
import html
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
C = ROOT / "data/elections/2027/candidates"
ref = json.loads((ROOT / "data/elections/2027/reference.json").read_text())
log = json.loads((ROOT / "data/inec/fetch_log.json").read_text())
parties = {p["acronym"] for p in ref["parties"]["registered"]}
# Constitutional minimum ages (1999 Constitution as amended by the 2018 "Not Too Young To Run" amendment)
MIN_AGE = {"presidential": 35, "governorship": 30, "senate": 35, "house_of_reps": 25, "state_assembly": 25}
# Long-standing totals. INEC's 2027 Assembly lists contain more state constituencies than 993
# (e.g. Delta "SAPELE II"); that is reported as information, not corrected.
EXPECTED = {"senate": 109, "house_of_reps": 360, "state_assembly": 993}

text_cache = {}
def doc_text(url):
    if url not in text_cache:
        # -bbox gives the raw words; plain mode would drop line-end hyphens ("HAYATU-" + "DEEN").
        out = subprocess.run(["pdftotext", "-bbox", str(ROOT / "data/inec" / log[url]["path"]), "-"], capture_output=True, text=True).stdout
        out = html.unescape(" ".join(re.findall(r">([^<]+)</word>", out)))
        text_cache[url] = {t for w in out.split() for t in w.split("-") if t}
    return text_cache[url]

issues = Counter()
examples = defaultdict(list)
for f in sorted(C.glob("*.json")):
    if f.name == "parse_report.json":
        continue
    data = json.loads(f.read_text())
    el = data["election"]
    districts = set()
    for e in data["entries"]:
        districts.add((e["state"], (e["constituency"] or "").upper()))
        if e["party"] not in parties:
            issues[f"{el}: unregistered party"] += 1; examples[f"{el}: unregistered party"].append((e["state"], e["sn"], e["party"]))
        for who in ("candidate", "running_mate"):
            p = e.get(who)
            if not p or not p["name"]:
                continue
            missing = [t for w in p["name"].split() for t in w.split("-") if t and t not in doc_text(e["source"]["url"])]
            if missing:
                issues[f"{el}: name token not in source"] += 1; examples[f"{el}: name token not in source"].append((e["state"], e["sn"], p["name"], missing))
            if p["age"] is None:
                issues[f"{el}: missing age"] += 1; examples[f"{el}: missing age"].append((e["state"], e["sn"], p["name"]))
            elif who == "candidate" and p["age"] < MIN_AGE[el]:
                issues[f"{el}: below constitutional minimum age"] += 1; examples[f"{el}: below constitutional minimum age"].append((e["state"], e["sn"], p["name"], p["age"]))
            if p["gender"] is None:
                issues[f"{el}: missing gender"] += 1; examples[f"{el}: missing gender"].append((e["state"], e["sn"], p["name"]))
    exp = EXPECTED.get(el)
    print(f"{el:15s} entries={len(data['entries']):6d} districts={len(districts):4d}" + (f" (expected {exp})" if exp else ""))
print()
for k, v in issues.most_common():
    print(f"{v:5d}  {k}   e.g. {examples[k][:3]}")
