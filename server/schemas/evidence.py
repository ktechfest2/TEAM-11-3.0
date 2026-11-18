from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from schemas.common import ORMModel, PUCode, Receipt, SHA256Hex, ShortText, UUIDStr


class EvidenceMeta(BaseModel):
    id: UUIDStr
    kind: Literal["result_sheet", "incident", "other"]
    sha256: SHA256Hex
    captured_at: datetime
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    location_accuracy_m: float | None = Field(None, ge=0)
    polling_unit_code: PUCode | None = None
    device_id: ShortText | None = None
    note: str | None = Field(None, max_length=2000)


class EvidenceOut(ORMModel):
    id: str
    reference: str
    kind: str
    sha256: str
    mime_type: str
    size_bytes: int
    captured_at: datetime
    received_at: datetime
    latitude: float | None
    longitude: float | None
    location_accuracy_m: float | None
    polling_unit_code: str | None
    note: str | None
    status: str


class EvidenceReceipt(BaseModel):
    evidence: EvidenceOut
    receipt: Receipt
