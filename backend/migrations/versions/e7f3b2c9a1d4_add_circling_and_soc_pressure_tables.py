"""add circling and soc pressure tables

Revision ID: e7f3b2c9a1d4
Revises: d2e4f6a8b1c3
Create Date: 2026-04-26 22:58:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e7f3b2c9a1d4"
down_revision = "d2e4f6a8b1c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parking_sessions", sa.Column("circling_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parking_sessions", sa.Column("circling_duration_seconds", sa.Integer(), nullable=True))

    op.create_table(
        "soc_snapshots",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("term_code", sa.String(), nullable=True),
        sa.Column("source_hash", sa.String(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "soc_lot_pressure",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("snapshot_id", sa.UUID(), nullable=False),
        sa.Column("lot_id", sa.String(), nullable=False),
        sa.Column("start_minute_of_week", sa.Integer(), nullable=False),
        sa.Column("end_minute_of_week", sa.Integer(), nullable=False),
        sa.Column("pressure_index", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["snapshot_id"], ["soc_snapshots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "snapshot_id",
            "lot_id",
            "start_minute_of_week",
            "end_minute_of_week",
            name="uq_soc_lot_pressure_bucket",
        ),
    )
    op.create_index("ix_soc_lot_pressure_lot_bucket", "soc_lot_pressure", ["lot_id", "start_minute_of_week"])


def downgrade() -> None:
    op.drop_index("ix_soc_lot_pressure_lot_bucket", table_name="soc_lot_pressure")
    op.drop_table("soc_lot_pressure")
    op.drop_table("soc_snapshots")
    op.drop_column("parking_sessions", "circling_duration_seconds")
    op.drop_column("parking_sessions", "circling_started_at")
