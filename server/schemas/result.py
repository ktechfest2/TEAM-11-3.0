from datetime import datetime
from typing import Any, Literal

import json
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

from schemas.common import ORMModel, PUCode, Receipt, ShortText, UUIDStr

Count = int  # validated by services.validation (negative values are flagged, not rejected)


_REF = Path(__file__).resolve().parent.parent / "data" / "elections" / "2027" / "reference.json"
REGISTERED_PARTIES = {p["acronym"] for p in json.loads(_REF.read_text())["parties"]["registered"]}


class PartyVote(BaseModel):
    party: ShortText = Field(min_length=1)
    votes: Count

    @field_validator("party")
    @classmethod
    def _registered(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in REGISTERED_PARTIES:
            raise ValueError(f"'{v}' is not an INEC-registered party ({', '.join(sorted(REGISTERED_PARTIES))})")
        return v


class ResultIn(BaseModel):
    id: UUIDStr
    created_at: datetime
    election_type: Literal["presidential", "senate", "house_of_reps", "governorship", "state_assembly", "local_government", "other"]
    polling_unit_code: PUCode = Field(min_length=1)
    state: str | None = Field(None, max_length=32, pattern=r"^[a-z-]+$")
    constituency: ShortText | None = None
    registered_voters: Count | None = None
    accredited_voters: Count | None = None
    ballots_issued: Count | None = None
    unused_ballots: Count | None = None
    spoiled_ballots: Count | None = None
    rejected_votes: Count | None = None
    total_valid_votes: Count | None = None
    total_used_ballots: Count | None = None
    total_votes_cast: Count | None = None
    party_votes: list[PartyVote] = Field(default_factory=list, max_length=40)
    evidence_id: UUIDStr | None = None
    extraction_method: Literal["manual", "ocr_assisted"] = "manual"


class ResultOut(ORMModel):
    id: str
    reference: str
    source: str
    election_type: str
    polling_unit_code: str
    state: str | None
    constituency: str | None
    registered_voters: int | None
    accredited_voters: int | None
    ballots_issued: int | None
    unused_ballots: int | None
    spoiled_ballots: int | None
    rejected_votes: int | None
    total_valid_votes: int | None
    total_used_ballots: int | None
    total_votes_cast: int | None
    party_votes: list[dict[str, Any]]
    evidence_id: str | None
    extraction_method: str
    validation: dict[str, Any]
    status: str
    created_at: datetime
    received_at: datetime


class ResultReceipt(BaseModel):
    result: ResultOut
    receipt: Receipt
