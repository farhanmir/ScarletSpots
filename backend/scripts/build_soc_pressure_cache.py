import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.soc_ingestion import (
    build_campus_building_to_lot_weights,
    build_lot_pressure_buckets,
    build_source_hash,
    parse_rutgers_soc_courses_payload,
    write_pressure_cache,
)
from app.services.soc_pressure import SOC_PRESSURE_CACHE_PATH

DEFAULT_SOC_URLS = [
    "https://classes.rutgers.edu/soc/api/courses.json?year=2026&term=1&campus=NB",
    "https://classes.rutgers.edu/soc/api/courses.json?year=2026&term=9&campus=NB",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build SOC lot pressure cache from Rutgers SOC API."
    )
    parser.add_argument(
        "--source-url",
        action="append",
        dest="source_urls",
        default=[],
        help="Rutgers SOC courses.json URL (can be passed multiple times).",
    )
    parser.add_argument(
        "--output",
        default=str(SOC_PRESSURE_CACHE_PATH),
        help="Output cache JSON path.",
    )
    parser.add_argument(
        "--default-attendance",
        type=float,
        default=35.0,
        help="Fallback estimated attendance per meeting when unknown.",
    )
    return parser.parse_args()


def fetch_json(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
        encoding = (response.headers.get("Content-Encoding") or "").lower()
        if encoding == "gzip" or raw[:2] == b"\x1f\x8b":
            import gzip

            raw = gzip.decompress(raw)
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, list):
        return []
    return payload


def load_lot_metadata() -> tuple[dict[str, str], dict[str, int]]:
    lot_data_path = (
        Path(__file__).resolve().parent.parent / "app" / "services" / "rutgers_parking_data.json"
    )
    payload = json.loads(lot_data_path.read_text(encoding="utf-8"))
    campus_by_lot: dict[str, str] = {}
    capacity_by_lot: dict[str, int] = {}
    for item in payload if isinstance(payload, list) else []:
        if not isinstance(item, dict):
            continue
        lot_id = str(item.get("mapId") or "").strip()
        if not lot_id:
            continue
        address = item.get("address") if isinstance(item.get("address"), dict) else {}
        campus_by_lot[lot_id] = str(address.get("campus") or "").strip()
        try:
            capacity_by_lot[lot_id] = max(0, int(item.get("totalSpaces") or 0))
        except Exception:
            capacity_by_lot[lot_id] = 0
    return campus_by_lot, capacity_by_lot


def main() -> None:
    args = parse_args()
    source_urls = args.source_urls or DEFAULT_SOC_URLS

    all_courses: list[dict] = []
    for url in source_urls:
        courses = fetch_json(url)
        print(f"Fetched {len(courses)} courses from {url}")
        all_courses.extend(courses)

    events = parse_rutgers_soc_courses_payload(
        all_courses,
        default_attendance=float(args.default_attendance),
    )
    building_keys = sorted({event.building_name for event in events})
    lot_campus_by_id, lot_capacity_by_id = load_lot_metadata()
    mapping = build_campus_building_to_lot_weights(
        building_keys=building_keys,
        lot_campus_by_id=lot_campus_by_id,
        lot_capacity_by_id=lot_capacity_by_id,
    )
    lot_pressure = build_lot_pressure_buckets(events, mapping)

    source_hash = build_source_hash({"source_urls": source_urls, "courses": all_courses})
    output_path = Path(args.output).resolve()
    write_pressure_cache(output_path=output_path, lot_pressure=lot_pressure, source_hash=source_hash)

    lots_with_pressure = sum(1 for _, buckets in lot_pressure.items() if buckets)
    print(
        f"Wrote {output_path} | events={len(events)} buildings={len(building_keys)} "
        f"mapped_buildings={len(mapping)} lots_with_pressure={lots_with_pressure}"
    )


if __name__ == "__main__":
    main()
