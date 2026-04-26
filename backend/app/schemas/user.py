from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ProfileBase(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None
    permit_type: str | None = None
    secondary_permit_type: str | None = None


class UserCreate(BaseModel):
    email: str
    password: str
    name: str | None = None


class ProfileUpdate(ProfileBase):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    model_config = ConfigDict(extra="forbid")


class Profile(ProfileBase):
    id: str  # maps to auth.users.id (uuid)
    email: str | None = None
    username: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    role: str = "user"
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SignupResponse(BaseModel):
    success: bool
    id: str
    email: str | None = None
