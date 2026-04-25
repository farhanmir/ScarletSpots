"""add friendship and push indexes

Revision ID: b6c8e1a4d2f9
Revises: a1d4f3c7b9e2
Create Date: 2026-04-25 11:35:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b6c8e1a4d2f9"
down_revision: Union[str, None] = "a1d4f3c7b9e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_friendships_friend_status_created",
        "friendships",
        ["friend_id", "status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_friendships_user_status",
        "friendships",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_device_push_tokens_active_user",
        "device_push_tokens",
        ["active", "user_id"],
        unique=False,
    )
    op.create_index(
        "ix_profiles_email_lower",
        "profiles",
        [sa.text("lower(email)")],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_device_push_tokens_active_user", table_name="device_push_tokens")
    op.drop_index("ix_friendships_user_status", table_name="friendships")
    op.drop_index("ix_friendships_friend_status_created", table_name="friendships")
    op.drop_index("ix_profiles_email_lower", table_name="profiles")

