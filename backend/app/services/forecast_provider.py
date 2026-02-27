from abc import ABC, abstractmethod
from typing import Any, Dict


class ForecastProvider(ABC):
    @abstractmethod
    def get_lot_forecast(
        self,
        lot_id: str,
        current_occupancy: int,
        capacity: int,
    ) -> Dict[str, Any]:
        """Generate a predictive occupancy forecast for a parking lot."""
        pass
