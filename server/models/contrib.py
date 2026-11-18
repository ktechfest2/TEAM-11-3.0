"""Native-speaker contributions: translations, voice recordings and accuracy evaluations."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


class Contributor(Base):
    __tablename__ = "contributors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120))
    languages: Mapped[list] = mapped_column(JSON, default=list)  # language codes they may work on
    role: Mapped[str] = mapped_column(String(16), default="translator")  # translator | reviewer | admin
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Translation(Base):
    """Every proposed text is kept (history). The current text for a key is the latest approved one."""
    __tablename__ = "translations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lang: Mapped[str] = mapped_column(String(8), index=True)
    key: Mapped[str] = mapped_column(String(80), index=True)
    text: Mapped[str] = mapped_column(Text)
    source_text: Mapped[str] = mapped_column(Text)  # the English text it translates (detects stale translations)
    status: Mapped[str] = mapped_column(String(12), default="draft")  # draft | approved | rejected
    author_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"))
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("contributors.id"), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Recording(Base):
    """A native-speaker audio clip: a spoken UI prompt (replaces TTS) or a voice command
    (used as a recognition template). Audio is 16 kHz mono WAV; `features` holds the MFCC
    template computed on the recording device, so every device uses the same feature code."""
    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    lang: Mapped[str] = mapped_column(String(8), index=True)
    kind: Mapped[str] = mapped_column(String(10), index=True)  # prompt | command
    key: Mapped[str] = mapped_column(String(80), index=True)  # i18n key (prompt) or intent (command)
    transcript: Mapped[str] = mapped_column(Text)
    speaker_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"), index=True)
    storage_path: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64))
    duration_ms: Mapped[int] = mapped_column(Integer)
    features: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    consent: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | approved | rejected
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("contributors.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Evaluation(Base):
    """One accuracy-test attempt: a speaker was asked to say an intent; the on-device recogniser
    answered. Only attempts by speakers who contributed NO templates for that language count
    towards the published accuracy (held-out speakers)."""
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lang: Mapped[str] = mapped_column(String(8), index=True)
    recognizer: Mapped[str] = mapped_column(String(40))
    pack_version: Mapped[str] = mapped_column(String(40))
    speaker_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"), index=True)
    expected: Mapped[str] = mapped_column(String(40))
    predicted: Mapped[str | None] = mapped_column(String(40), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
