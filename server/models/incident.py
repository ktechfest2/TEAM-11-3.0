from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


class Incident(Base):
    """A citizen/observer report. Always an *allegation* until a human reviewer verifies it."""

    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    polling_unit_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    location_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    anonymous: Mapped[bool] = mapped_column(Boolean, default=True)
    reporter_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    evidence_ids: Mapped[list] = mapped_column(JSON, default=list)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    # allegation -> under_review -> verified | not_verified
    status: Mapped[str] = mapped_column(String(20), default="allegation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
