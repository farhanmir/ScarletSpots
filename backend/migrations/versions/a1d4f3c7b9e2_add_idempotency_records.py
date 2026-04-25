"""add idempotency records table

Revision ID: a1d4f3c7b9e2
Revises: 9c2d1e5a4f7b
Create Date: 2026-04-25 11:20:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1d4f3c7b9e2"
down_revision: Union[str, None] = "9c2d1e5a4f7b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "idempotency_records",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.String(), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("response_body", sa.String(), nullable=False),
        sa.Column(
            "status_code",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("200"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_idempotency_records_user_endpoint_key",
        "idempotency_records",
        ["user_id", "endpoint", "idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_idempotency_records_user_endpoint_key", table_name="idempotency_records")
    op.drop_table("idempotency_records")

