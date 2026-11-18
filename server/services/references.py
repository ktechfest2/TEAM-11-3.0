"""Human-readable reference numbers, e.g. AWV-EV-20261118-7K3QXM.

Derived from the record's UUID so the client can generate the same reference offline
and the server can re-derive (and check) it.
"""
import hashlib
from datetime import datetime

ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O/1/I to avoid misreading aloud
PREFIX = {"evidence": "EV", "incident": "IN", "result": "RS"}


def make_reference(kind: str, record_id: str, created_at: datetime) -> str:
    digest = hashlib.sha256(record_id.encode()).digest()
    code = "".join(ALPHABET[b % len(ALPHABET)] for b in digest[:6])
    return f"AWV-{PREFIX[kind]}-{created_at.strftime('%Y%m%d')}-{code}"
