import json

import pytest

from services.validation import validate_result
from tests.conftest import REPO_ROOT

CASES = json.loads((REPO_ROOT / "tests/fixtures/ec8a_validation_cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_ec8a_cases(case):
    out = validate_result(case["input"])
    assert out["status"] == case["expected_status"]
    failures = sorted(c["id"] for c in out["checks"] if c["status"] == "fail")
    assert failures == sorted(case["expected_failures"])


def test_never_uses_fraud_language():
    out = validate_result({"total_valid_votes": 1, "party_votes": [{"party": "A", "votes": 5}]})
    assert "fraud" not in json.dumps(out).lower()
