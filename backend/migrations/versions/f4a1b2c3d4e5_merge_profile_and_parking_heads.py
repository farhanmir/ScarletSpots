"""merge profile and parking heads

Revision ID: f4a1b2c3d4e5
Revises: b3f9d2a1e8c4, e7f3b2c9a1d4
Create Date: 2026-04-26 23:08:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "f4a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = ("b3f9d2a1e8c4", "e7f3b2c9a1d4")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
