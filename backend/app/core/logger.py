import logging
import sys


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        fmt = logging.Formatter("%(asctime)s  %(name)s  %(levelname)s  %(message)s")
        handler.setFormatter(fmt)
        logger.addHandler(handler)

    return logger
