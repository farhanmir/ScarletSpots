import json
import logging
import sys
from datetime import datetime


class StructuredFormatter(logging.Formatter):
    """JSON-structured log formatter with correlation ID support."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Inject correlation_id if present
        if hasattr(record, "correlation_id"):
            log_entry["correlation_id"] = record.correlation_id

        # Include exception info if present
        if record.exc_info:
            import traceback

            log_entry["exception"] = "".join(traceback.format_exception(*record.exc_info))

        return json.dumps(log_entry)


def get_logger(name: str) -> logging.Logger:
    _logger = logging.getLogger(name)
    _logger.setLevel(logging.INFO)

    if not _logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(StructuredFormatter())
        _logger.addHandler(handler)

    return _logger


# Default app logger
logger = get_logger("scarletspots")
