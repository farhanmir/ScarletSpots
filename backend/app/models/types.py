from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID

UUID_SQL = UUID(as_uuid=True).with_variant(String(36), "sqlite")
