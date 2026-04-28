"""add notification prefs and session reminder tracking

Revision ID: f9b2c4d6e8a1
Revises: f4a1b2c3d4e5
Create Date: 2026-04-28 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f9b2c4d6e8a1"
down_revision = "f4a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "notify_parking_restrictions",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "profiles",
        sa.Column(
            "notify_friend_same_lot",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "profiles",
        sa.Column(
            "notify_auto_park_started",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "profiles",
        sa.Column(
            "notify_auto_park_ended",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "parking_sessions",
        sa.Column("last_restriction_notification_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("parking_sessions", "last_restriction_notification_at")
    op.drop_column("profiles", "notify_auto_park_ended")
    op.drop_column("profiles", "notify_auto_park_started")
    op.drop_column("profiles", "notify_friend_same_lot")
    op.drop_column("profiles", "notify_parking_restrictions")
