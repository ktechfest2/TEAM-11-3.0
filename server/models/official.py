from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


class OfficialResult(Base):
    """A result as OFFICIALLY published for one polling unit: the EC8A image on INEC's IReV portal,
    a collation sheet (EC8B…) or a public announcement. Entered by an accredited observer (with the
    source link) so AwaVote can compare "what was on the wall" with "what was counted"."""

    __tablename__ = "official_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    election_type: Mapped[str] = mapped_column(String(32))
    polling_unit_code: Mapped[str] = mapped_column(String(32), index=True)
    source: Mapped[str] = mapped_column(String(32))  # irev | collation | announcement
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    party_votes: Mapped[list] = mapped_column(JSON, default=list)
    total_valid_votes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entered_by: Mapped[str] = mapped_column(String(120))
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
