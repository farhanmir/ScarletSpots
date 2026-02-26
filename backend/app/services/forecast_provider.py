from abc import ABC, abstractmethod
from typing import Dict, Any
from uuid import UUID

class ForecastProvider(ABC):
    @abstractmethod
    def get_lot_forecast(self, lot_id: UUID, current_occupancy: int, capacity: int) -> Dict[str, Any]:
        """Generate a predictive forecast for a parking lot."""
        pass
