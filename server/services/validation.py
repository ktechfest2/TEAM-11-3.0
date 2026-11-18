"""EC8A polling-unit result sheet arithmetic checks.

Mirrors client/lib/validation/ec8a.js. Both are tested against
tests/fixtures/ec8a_validation_cases.json so offline and online results agree.

Field definitions follow the EC8A layout used in the 2023 general elections:
  registered_voters   - voters on the register
  accredited_voters   - voters accredited (BVAS)
  ballots_issued      - ballot papers issued to the polling unit
  unused_ballots      - unused ballot papers
  spoiled_ballots     - spoiled ballot papers
  rejected_votes      - rejected ballots
  total_valid_votes   - total valid votes (sum of party scores)
  total_used_ballots  - used ballot papers = spoiled + rejected + valid
  total_votes_cast    - valid + rejected (not printed on every form version; optional)
Confirm these against the form version INEC publishes for each election before use.

A failed check means "needs human review". It is NEVER a finding of fraud: transcription
errors, OCR errors and form-filling mistakes are far more common explanations.
"""
from typing import Any

NUMERIC_FIELDS = (
    "registered_voters", "accredited_voters", "ballots_issued", "unused_ballots",
    "spoiled_ballots", "rejected_votes", "total_valid_votes", "total_used_ballots",
    "total_votes_cast",
)


def _check(cid: str, ok: bool | None, expected=None, actual=None) -> dict[str, Any]:
    status = "skipped" if ok is None else ("pass" if ok else "fail")
    return {"id": cid, "status": status, "expected": expected, "actual": actual}


def _have(*vals) -> bool:
    return all(v is not None for v in vals)


def validate_result(data: dict[str, Any]) -> dict[str, Any]:
    g = {f: data.get(f) for f in NUMERIC_FIELDS}
    parties = data.get("party_votes") or []
    party_values = [p.get("votes") for p in parties]

    checks: list[dict[str, Any]] = []

    all_values = [v for v in g.values() if v is not None] + [v for v in party_values if v is not None]
    bad = [v for v in all_values if not isinstance(v, int) or isinstance(v, bool) or v < 0]
    checks.append(_check("non_negative_integers", not bad, actual=bad or None))

    valid, rejected, spoiled = g["total_valid_votes"], g["rejected_votes"], g["spoiled_ballots"]

    if parties and all(isinstance(v, int) for v in party_values) and valid is not None:
        s = sum(party_values)
        checks.append(_check("party_sum_equals_valid", s == valid, expected=valid, actual=s))
    else:
        checks.append(_check("party_sum_equals_valid", None))

    if _have(valid, rejected, g["total_votes_cast"]):
        checks.append(_check("valid_plus_rejected_equals_cast", valid + rejected == g["total_votes_cast"],
                             expected=g["total_votes_cast"], actual=valid + rejected))
    else:
        checks.append(_check("valid_plus_rejected_equals_cast", None))

    if _have(valid, rejected, spoiled, g["total_used_ballots"]):
        used = valid + rejected + spoiled
        checks.append(_check("used_ballots_breakdown", used == g["total_used_ballots"],
                             expected=g["total_used_ballots"], actual=used))
    else:
        checks.append(_check("used_ballots_breakdown", None))

    if _have(g["ballots_issued"], g["unused_ballots"], g["total_used_ballots"]):
        total = g["total_used_ballots"] + g["unused_ballots"]
        checks.append(_check("issued_equals_used_plus_unused", total == g["ballots_issued"],
                             expected=g["ballots_issued"], actual=total))
    else:
        checks.append(_check("issued_equals_used_plus_unused", None))

    if _have(g["accredited_voters"], g["registered_voters"]):
        checks.append(_check("accredited_within_register", g["accredited_voters"] <= g["registered_voters"],
                             expected=g["registered_voters"], actual=g["accredited_voters"]))
    else:
        checks.append(_check("accredited_within_register", None))

    if _have(valid, rejected, g["accredited_voters"]):
        cast = valid + rejected
        checks.append(_check("votes_cast_within_accredited", cast <= g["accredited_voters"],
                             expected=g["accredited_voters"], actual=cast))
    else:
        checks.append(_check("votes_cast_within_accredited", None))

    if any(c["status"] == "fail" for c in checks):
        status = "needs_review"
    elif next(c for c in checks if c["id"] == "party_sum_equals_valid")["status"] == "skipped":
        status = "incomplete"
    else:
        status = "consistent"
    return {"status": status, "checks": checks}
