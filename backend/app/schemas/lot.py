from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List
from uuid import UUID

# --- Parking Lot Schemas ---
class ParkingLotBase(BaseModel):
    name: str
    campus: str
    latitude: float
    longitude: float
    capacity: int = 0
    current_occupancy: int = 0

class ParkingLot(ParkingLotBase):
    id: UUID
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# --- Occupancy Log Schemas ---
class OccupancyLogBase(BaseModel):
    occupancy_level: int
    status: str # 'open', 'full', 'crowded'
    confidence_score: float = 1.0

class OccupancyLogCreate(OccupancyLogBase):
    pass

class OccupancyLog(OccupancyLogBase):
    id: UUID
    lot_id: UUID
    reporter_id: Optional[UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
