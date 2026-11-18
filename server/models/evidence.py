from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


class Evidence(Base):
    """An original captured image. The file is stored content-addressed by its SHA-256.

    The hash establishes file integrity *after capture*; it does not prove the image is
    authentic or that the election process it depicts was truthful.
    """

    __tablename__ = "evidence"

    # Client-generated UUID: doubles as the idempotency key for offline retries.
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(32))  # result_sheet | incident | other
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    mime_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(255))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    polling_unit_code: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # submitted -> under_review -> reviewed | rejected
    status: Mapped[str] = mapped_column(String(20), default="submitted")
