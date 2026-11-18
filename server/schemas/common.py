from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

UUIDStr = Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F-]{36}$")]
SHA256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
PUCode = Annotated[str, StringConstraints(strip_whitespace=True, max_length=32, pattern=r"^[0-9A-Za-z/\-]*$")]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Receipt(BaseModel):
    """Server acknowledgement, HMAC-signed so the client can prove the server accepted it."""
    record_id: str
    content_hash: str
    received_at: datetime
    signature: str
    duplicate: bool = Field(False, description="True if this exact record had already been received.")
