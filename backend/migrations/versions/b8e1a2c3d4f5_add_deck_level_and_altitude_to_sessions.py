"""add deck level and altitude columns to parking_sessions

Revision ID: b8e1a2c3d4f5
Revises: f9b2c4d6e8a1
Create Date: 2026-05-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b8e1a2c3d4f5"
down_revision = "f9b2c4d6e8a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "parking_sessions",
        sa.Column("deck_level_label", sa.String(), nullable=True),
    )
    op.add_column(
        "parking_sessions",
        sa.Column("deck_level_key", sa.String(), nullable=True),
    )
    op.add_column(
        "parking_sessions",
        sa.Column("altitude_meters", sa.Float(), nullable=True),
    )
    op.add_column(
        "parking_sessions",
        sa.Column("altitude_accuracy_meters", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("parking_sessions", "altitude_accuracy_meters")
    op.drop_column("parking_sessions", "altitude_meters")
    op.drop_column("parking_sessions", "deck_level_key")
    op.drop_column("parking_sessions", "deck_level_label")
