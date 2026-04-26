"""add session source metadata

Revision ID: d2e4f6a8b1c3
Revises: c4d8e2f1a9b7
Create Date: 2026-04-26 22:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2e4f6a8b1c3"
down_revision: Union[str, None] = "c4d8e2f1a9b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("parking_sessions", sa.Column("start_source", sa.String(), nullable=True))
    op.add_column("parking_sessions", sa.Column("end_source", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("parking_sessions", "end_source")
    op.drop_column("parking_sessions", "start_source")
