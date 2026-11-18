from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from database.session import Base


class ResultSubmission(Base):
    """Figures transcribed from an EC8A polling-unit result sheet by an independent submitter.

    This is NOT an official result. `source` is always "independent_submission" for
    records created through the public API.
    """

    __tablename__ = "result_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(32), default="independent_submission")
    election_type: Mapped[str] = mapped_column(String(32))
    polling_unit_code: Mapped[str] = mapped_column(String(32), index=True)
    state: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    constituency: Mapped[str | None] = mapped_column(String(120), nullable=True)
    registered_voters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accredited_voters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ballots_issued: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unused_ballots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spoiled_ballots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rejected_votes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_valid_votes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_used_ballots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_votes_cast: Mapped[int | None] = mapped_column(Integer, nullable=True)
    party_votes: Mapped[list] = mapped_column(JSON, default=list)  # [{"party": "ABC", "votes": 12}]
    evidence_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    extraction_method: Mapped[str] = mapped_column(String(20), default="manual")  # manual | ocr_assisted
    validation: Mapped[dict] = mapped_column(JSON, default=dict)
    content_hash: Mapped[str] = mapped_column(String(64))
    # submitted -> under_review -> reviewed
    status: Mapped[str] = mapped_column(String(20), default="submitted")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
