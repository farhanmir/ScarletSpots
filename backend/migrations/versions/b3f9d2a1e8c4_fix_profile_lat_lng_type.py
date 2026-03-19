"""fix profile lat/lng type

Revision ID: b3f9d2a1e8c4
Revises: 9c2d1e5a4f7b
Create Date: 2026-03-18 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f9d2a1e8c4"
down_revision: Union[str, None] = "9c2d1e5a4f7b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "profiles",
        "latitude",
        existing_type=sa.String(),
        type_=sa.Float(),
        nullable=True,
        postgresql_using="latitude::double precision",
    )
    op.alter_column(
        "profiles",
        "longitude",
        existing_type=sa.String(),
        type_=sa.Float(),
        nullable=True,
        postgresql_using="longitude::double precision",
    )


def downgrade() -> None:
    op.alter_column(
        "profiles",
        "longitude",
        existing_type=sa.Float(),
        type_=sa.String(),
        nullable=True,
        postgresql_using="longitude::text",
    )
    op.alter_column(
        "profiles",
        "latitude",
        existing_type=sa.Float(),
        type_=sa.String(),
        nullable=True,
        postgresql_using="latitude::text",
    )
