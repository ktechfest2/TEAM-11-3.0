"""official results (wall vs announced)

Revision ID: a7c1e5d9b2f4
Revises: f3095c3f2344
Create Date: 2026-11-20 10:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c1e5d9b2f4"
down_revision: Union[str, Sequence[str], None] = "f3095c3f2344"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "official_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("reference", sa.String(length=40), nullable=False),
        sa.Column("election_type", sa.String(length=32), nullable=False),
        sa.Column("polling_unit_code", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("party_votes", sa.JSON(), nullable=False),
        sa.Column("total_valid_votes", sa.Integer(), nullable=True),
        sa.Column("entered_by", sa.String(length=120), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_official_results_reference"), "official_results", ["reference"], unique=True)
    op.create_index(op.f("ix_official_results_polling_unit_code"), "official_results", ["polling_unit_code"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_official_results_polling_unit_code"), table_name="official_results")
    op.drop_index(op.f("ix_official_results_reference"), table_name="official_results")
    op.drop_table("official_results")
