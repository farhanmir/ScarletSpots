from __future__ import annotations
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class ProfileBase(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None

class ProfileUpdate(ProfileBase):
    pass

class Profile(ProfileBase):
    id: str  # maps to auth.users.id (uuid)
    email: str | None = None
    username: str | None = None
    role: str = 'user'
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
