#!/usr/bin/env python3
"""
Aggregate parking_sessions (deck_level_key + altitude) for maintainer review
and optional `deck_level_bands.json` output.

Requires DATABASE_URL (same as the FastAPI app). Run locally or over SSH
against the server DB — never commit secrets.

Example:
  DATABASE_URL=postgresql+asyncpg://... python scripts/export_deck_level_calibration.py --output bands.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

STATS_SQL = text(
    """
    WITH filtered AS (
      SELECT
        lot_id,
        NULLIF(TRIM(deck_level_key), '') AS deck_level_key,
        altitude_meters,
        altitude_accuracy_meters
      FROM parking_sessions
      WHERE deck_level_key IS NOT NULL
        AND TRIM(deck_level_key) <> ''
        AND altitude_meters IS NOT NULL
        AND altitude_accuracy_meters IS NOT NULL
        AND altitude_accuracy_meters > 0
        AND altitude_accuracy_meters <= 45
    )
    SELECT
      lot_id,
      deck_level_key,
      COUNT(*)::int AS n,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY altitude_meters) AS median_alt,
      percentile_disc(0.25) WITHIN GROUP (ORDER BY altitude_meters) AS p25,
      percentile_disc(0.75) WITHIN GROUP (ORDER BY altitude_meters) AS p75
    FROM filtered
    GROUP BY lot_id, deck_level_key
    HAVING COUNT(*) >= 5
    ORDER BY lot_id, deck_level_key
    """
)


def _band_from_row(row: dict) -> dict | None:
    n = int(row["n"])
    if n < 20:
        return None
    p25 = float(row["p25"])
    p75 = float(row["p75"])
    if not (math.isfinite(p25) and math.isfinite(p75)) or p75 <= p25:
        return None
    span = p75 - p25
    if span > 22:
        return None
    key = str(row["deck_level_key"])
    return {
        "levelKey": key,
        "label": key,
        "altitudeMinMeters": round(p25, 2),
        "altitudeMaxMeters": round(p75, 2),
        "sampleCount": n,
    }


async def run_stats() -> list[dict]:
    async with engine.connect() as conn:
        result = await conn.execute(STATS_SQL)
        rows = [dict(r._mapping) for r in result]
    for r in rows:
        for k in ("median_alt", "p25", "p75"):
            if r[k] is not None:
                r[k] = float(r[k])
    return rows


def build_bands(stats: list[dict]) -> dict[str, list[dict]]:
    bands_by_lot: dict[str, list[dict]] = {}
    for row in stats:
        band = _band_from_row(row)
        if band is None:
            continue
        lot_id = str(row["lot_id"])
        bands_by_lot.setdefault(lot_id, []).append(band)
    return bands_by_lot


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("deck_level_calibration_export.json"),
        help="Write combined stats + suggested bands JSON here.",
    )
    args = parser.parse_args()

    stats = await run_stats()
    bands = build_bands(stats)
    payload = {
        "version": 1,
        "stats": stats,
        "bandsByLotId": bands,
    }
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {args.output} ({len(stats)} stat rows, {len(bands)} lots with bands).")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
