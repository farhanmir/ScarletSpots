"""add secondary permit and split sharing flags

Revision ID: c4d8e2f1a9b7
Revises: b6c8e1a4d2f9
Create Date: 2026-04-26 12:58:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d8e2f1a9b7"
down_revision: Union[str, None] = "b6c8e1a4d2f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("secondary_permit_type", sa.String(), nullable=True))

    op.add_column(
        "friendships",
        sa.Column("initiator_sharing_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "friendships",
        sa.Column("recipient_sharing_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute(
        sa.text(
            """
            UPDATE friendships
            SET initiator_sharing_enabled = COALESCE(sharing_enabled, false),
                recipient_sharing_enabled = COALESCE(sharing_enabled, false)
            """
        )
    )
    op.drop_column("friendships", "sharing_enabled")


def downgrade() -> None:
    op.add_column(
        "friendships",
        sa.Column("sharing_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        sa.text(
            """
            UPDATE friendships
            SET sharing_enabled = COALESCE(initiator_sharing_enabled, false)
                                OR COALESCE(recipient_sharing_enabled, false)
            """
        )
    )
    op.drop_column("friendships", "recipient_sharing_enabled")
    op.drop_column("friendships", "initiator_sharing_enabled")

    op.drop_column("profiles", "secondary_permit_type")
