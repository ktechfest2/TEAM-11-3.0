from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from schemas.common import ORMModel, PUCode, Receipt, ShortText, UUIDStr

IncidentCategory = Literal[
    "intimidation", "violence", "vote_buying", "missing_materials",
    "disruption", "accessibility_barrier", "other",
]


class IncidentIn(BaseModel):
    id: UUIDStr
    category: IncidentCategory
    description: str = Field(min_length=3, max_length=5000)
    occurred_at: datetime | None = None
    created_at: datetime
    polling_unit_code: PUCode | None = None
    location_text: ShortText | None = None
    anonymous: bool = True
    reporter_contact: ShortText | None = None
    evidence_ids: list[UUIDStr] = Field(default_factory=list, max_length=10)
    language: Literal["en", "pcm", "yo", "ha", "ig"] | None = None

    @model_validator(mode="after")
    def _anonymous_has_no_contact(self):
        # Privacy: an anonymous report must never carry contact details, even if the client sent some.
        if self.anonymous:
            self.reporter_contact = None
        return self


class IncidentOut(ORMModel):
    id: str
    reference: str
    category: str
    description: str
    occurred_at: datetime | None
    created_at: datetime
    received_at: datetime
    polling_unit_code: str | None
    location_text: str | None
    anonymous: bool
    evidence_ids: list[str]
    status: str


class IncidentReceipt(BaseModel):
    incident: IncidentOut
    receipt: Receipt
