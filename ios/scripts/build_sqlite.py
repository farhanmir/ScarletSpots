#!/usr/bin/env python3
"""Build the bundled SQLite database consumed by the ios app.

Reads the canonical JSON files in `ios/data-sources/` and writes a
fully-populated `scarletspots.sqlite` into `ios/ScarletSpots/Resources/`.

JSON stays the source of truth. The .sqlite file is a build artifact that is
committed so the Swift side always has an up-to-date database to ship in the
app bundle. Run this script whenever any of the JSON inputs change.

    python ios/scripts/build_sqlite.py

Schema highlights:
    - lots                    scalar lot metadata (one row per lot)
    - lot_polygons            boundary rings as packed little-endian BLOBs
    - buildings / places      lookup data for search + map centering
    - permits / permit_lots   permit -> allowed lot mappings
    - permit_schedules        time_text_1 / time_text_2 per (permit, lot)
    - permit_schedule_slots   weekday+time ranges per (permit, lot)
    - lots_fts / buildings_fts / places_fts
                              FTS5 trigram indexes for fast typeahead
    - meta                    schema_version / generated_at metadata
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import struct
import sqlite3
import sys
from pathlib import Path

SCHEMA_VERSION = 1

SCRIPT_DIR = Path(__file__).resolve().parent
IOS_NATIVE_ROOT = SCRIPT_DIR.parent
DEFAULT_SOURCES = IOS_NATIVE_ROOT / "data-sources"
DEFAULT_OUTPUT = IOS_NATIVE_ROOT / "ScarletSpots" / "Resources" / "scarletspots.sqlite"


SCHEMA_SQL = r"""
PRAGMA foreign_keys = ON;

CREATE TABLE meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE lots (
    map_id              TEXT PRIMARY KEY NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    property_code       TEXT NOT NULL DEFAULT '',
    property_name       TEXT NOT NULL,
    short_name          TEXT NOT NULL,
    address1            TEXT,
    city_code           TEXT,
    region_code         TEXT,
    site_code           TEXT,
    campus              TEXT,
    latitude            REAL NOT NULL,
    longitude           REAL NOT NULL,
    total_spaces        INTEGER NOT NULL DEFAULT 0,
    general_available   INTEGER NOT NULL DEFAULT 0,
    visitor             INTEGER NOT NULL DEFAULT 0,
    handicapped         INTEGER NOT NULL DEFAULT 0,
    ev_charging         INTEGER NOT NULL DEFAULT 0,
    fifteen_min         INTEGER NOT NULL DEFAULT 0,
    food_truck          INTEGER NOT NULL DEFAULT 0,
    garage              INTEGER NOT NULL DEFAULT 0,
    solar               INTEGER NOT NULL DEFAULT 0,
    uncovered           INTEGER NOT NULL DEFAULT 1,
    regular_gate        INTEGER NOT NULL DEFAULT 0,
    smart_gate          INTEGER NOT NULL DEFAULT 0,
    student             INTEGER NOT NULL DEFAULT 0,
    employee            INTEGER NOT NULL DEFAULT 0,
    ev_charge_info      TEXT,
    emp_hours           TEXT NOT NULL DEFAULT '',
    note                TEXT NOT NULL DEFAULT '',
    photos_json         TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_lots_region  ON lots(region_code);
CREATE INDEX idx_lots_campus  ON lots(campus);
CREATE INDEX idx_lots_active  ON lots(active);

-- Polygon rings for a lot. A lot can have many disjoint polygons (MultiPolygon)
-- and each polygon has exactly one outer ring plus zero or more inner holes.
-- `points` is packed native-doubles (little-endian): lat0,lng0,lat1,lng1,...
CREATE TABLE lot_polygons (
    lot_id          TEXT    NOT NULL,
    polygon_index   INTEGER NOT NULL,
    ring_index      INTEGER NOT NULL,
    is_outer        INTEGER NOT NULL,
    point_count     INTEGER NOT NULL,
    points          BLOB    NOT NULL,
    PRIMARY KEY (lot_id, polygon_index, ring_index),
    FOREIGN KEY (lot_id) REFERENCES lots(map_id)
);

CREATE INDEX idx_lot_polygons_lot ON lot_polygons(lot_id);

CREATE TABLE buildings (
    name      TEXT PRIMARY KEY NOT NULL,
    latitude  REAL NOT NULL,
    longitude REAL NOT NULL,
    address   TEXT NOT NULL,
    campus    TEXT NOT NULL
);

CREATE INDEX idx_buildings_campus ON buildings(campus);

CREATE TABLE places (
    id       TEXT PRIMARY KEY NOT NULL,
    name     TEXT NOT NULL,
    address  TEXT NOT NULL,
    campus   TEXT,
    aliases  TEXT
);

CREATE TABLE permits (
    permit_type TEXT PRIMARY KEY NOT NULL,
    is_commuter INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE permit_lots (
    permit_type TEXT NOT NULL,
    lot_id      TEXT NOT NULL,
    lot_name    TEXT,
    PRIMARY KEY (permit_type, lot_id),
    FOREIGN KEY (permit_type) REFERENCES permits(permit_type)
);

CREATE INDEX idx_permit_lots_permit ON permit_lots(permit_type);
CREATE INDEX idx_permit_lots_lot    ON permit_lots(lot_id);

CREATE TABLE permit_schedules (
    permit_type  TEXT NOT NULL,
    lot_id       TEXT NOT NULL,
    time_text_1  TEXT,
    time_text_2  TEXT,
    PRIMARY KEY (permit_type, lot_id)
);

-- Weekday index matches JavaScript's Date#getDay(): 0 = Sunday, 6 = Saturday.
-- start_minute / end_minute are minutes past midnight (end may be 1440 for
-- "until midnight", matching the mobile helper's behaviour).
CREATE TABLE permit_schedule_slots (
    permit_type  TEXT NOT NULL,
    lot_id       TEXT NOT NULL,
    weekday      INTEGER NOT NULL,
    slot_index   INTEGER NOT NULL,
    start_minute INTEGER NOT NULL,
    end_minute   INTEGER NOT NULL,
    PRIMARY KEY (permit_type, lot_id, weekday, slot_index)
);

CREATE INDEX idx_permit_slots_lookup
    ON permit_schedule_slots(permit_type, lot_id, weekday);

-- FTS5 with the trigram tokenizer so typeahead matches any substring,
-- mirroring the existing Swift `.contains()` behaviour.
CREATE VIRTUAL TABLE lots_fts USING fts5(
    map_id UNINDEXED,
    short_name,
    property_name,
    campus,
    tokenize = 'trigram'
);

CREATE VIRTUAL TABLE buildings_fts USING fts5(
    name UNINDEXED,
    name_text,
    address,
    campus,
    tokenize = 'trigram'
);

CREATE VIRTUAL TABLE places_fts USING fts5(
    id UNINDEXED,
    name,
    aliases,
    address,
    tokenize = 'trigram'
);
"""


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def pack_ring(points):
    """Pack a list of [lng, lat] pairs into a native-byte-order blob of
    (lat, lng) doubles for fast Swift-side decoding.

    Returns (point_count, blob). Rings with < 3 valid points produce an empty
    result so callers can filter them out.
    """
    flat: list[float] = []
    count = 0
    for point in points:
        if len(point) < 2:
            continue
        lng, lat = float(point[0]), float(point[1])
        flat.append(lat)
        flat.append(lng)
        count += 1
    if count < 3:
        return 0, b""
    blob = struct.pack(f"<{count * 2}d", *flat)
    return count, blob


def parse_time_to_minutes(text: str) -> int | None:
    try:
        hh, mm = text.split(":")
        return int(hh) * 60 + int(mm)
    except (ValueError, AttributeError):
        return None


def insert_lots(conn: sqlite3.Connection, lots_json: list[dict]) -> int:
    cur = conn.cursor()
    rows = []
    polygon_rows = []

    for lot in lots_json:
        map_id = str(lot.get("mapId"))
        if not map_id:
            continue
        address = lot.get("address") or {}
        location = lot.get("location") or {}
        photos = lot.get("photos") or []
        rows.append(
            (
                map_id,
                1 if lot.get("active", True) else 0,
                lot.get("propertyCode") or "",
                lot.get("propertyName") or "",
                lot.get("shortName") or "",
                address.get("address1"),
                address.get("cityCode"),
                address.get("regionCode"),
                address.get("siteCode"),
                address.get("campus"),
                float(location.get("lat") or 0.0),
                float(location.get("lng") or 0.0),
                int(lot.get("totalSpaces") or 0),
                int(lot.get("generalAvailable") or 0),
                int(lot.get("visitor") or 0),
                int(lot.get("handicapped") or 0),
                int(lot.get("evCharging") or 0),
                int(lot.get("fifteenMin") or 0),
                int(lot.get("foodTruck") or 0),
                1 if lot.get("garage") else 0,
                1 if lot.get("solar") else 0,
                1 if lot.get("uncovered", True) else 0,
                1 if lot.get("regularGate") else 0,
                1 if lot.get("smartGate") else 0,
                1 if lot.get("student") else 0,
                1 if lot.get("employee") else 0,
                lot.get("evChargeInfo"),
                lot.get("empHours") or "",
                lot.get("note") or "",
                json.dumps(list(photos), ensure_ascii=False),
            )
        )
        polygon_rows.extend(_polygon_rows(map_id, lot.get("gtfsGeometry")))

    cur.executemany(
        """
        INSERT INTO lots (
            map_id, active, property_code, property_name, short_name,
            address1, city_code, region_code, site_code, campus,
            latitude, longitude, total_spaces, general_available, visitor,
            handicapped, ev_charging, fifteen_min, food_truck,
            garage, solar, uncovered, regular_gate, smart_gate,
            student, employee, ev_charge_info, emp_hours, note, photos_json
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?
        )
        """,
        rows,
    )

    cur.executemany(
        """
        INSERT INTO lot_polygons (
            lot_id, polygon_index, ring_index, is_outer, point_count, points
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        polygon_rows,
    )
    return len(rows)


def _polygon_rows(map_id: str, geometry):
    """Yield rows for `lot_polygons`. Handles GeoJSON Polygon (outer + holes)
    and the dataset's flat MultiPolygon convention (each top-level element is
    an independent outer ring)."""
    if not geometry:
        return
    gtype = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if gtype == "Polygon":
        # coords[0] = outer ring, coords[1..] = holes
        if not coords:
            return
        for ring_index, ring in enumerate(coords):
            count, blob = pack_ring(ring)
            if count == 0:
                continue
            yield (
                map_id,
                0,
                ring_index,
                1 if ring_index == 0 else 0,
                count,
                blob,
            )
    elif gtype == "MultiPolygon":
        # Dataset-specific shape: each element is a separate outer ring.
        for polygon_index, ring in enumerate(coords):
            count, blob = pack_ring(ring)
            if count == 0:
                continue
            yield (
                map_id,
                polygon_index,
                0,
                1,
                count,
                blob,
            )


def insert_buildings(conn: sqlite3.Connection, buildings_json: list[dict]) -> int:
    cur = conn.cursor()
    rows = []
    seen = set()
    for building in buildings_json:
        name = building.get("name")
        if not name or name in seen:
            continue
        seen.add(name)
        rows.append(
            (
                name,
                float(building.get("latitude") or 0.0),
                float(building.get("longitude") or 0.0),
                building.get("address") or "",
                building.get("campus") or "",
            )
        )
    cur.executemany(
        "INSERT INTO buildings (name, latitude, longitude, address, campus) "
        "VALUES (?, ?, ?, ?, ?)",
        rows,
    )
    return len(rows)


def insert_places(conn: sqlite3.Connection, places_json: list[dict]) -> int:
    cur = conn.cursor()
    rows = []
    seen = set()
    for place in places_json:
        pid = str(place.get("id") or "")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        rows.append(
            (
                pid,
                place.get("name") or "",
                place.get("address") or "",
                place.get("campus"),
                place.get("aliases"),
            )
        )
    cur.executemany(
        "INSERT INTO places (id, name, address, campus, aliases) VALUES (?, ?, ?, ?, ?)",
        rows,
    )
    return len(rows)


def insert_permits(
    conn: sqlite3.Connection,
    mapping: dict[str, list[dict]],
    schedules: dict[str, dict[str, dict]],
) -> tuple[int, int, int, int]:
    cur = conn.cursor()

    permit_rows = []
    permit_lot_rows = []
    for permit_type, entries in mapping.items():
        is_commuter = 1 if "commuter" in permit_type.lower() else 0
        permit_rows.append((permit_type, is_commuter))
        for entry in entries:
            lot_id = str(entry.get("id") or "")
            if not lot_id:
                continue
            permit_lot_rows.append(
                (permit_type, lot_id, entry.get("name"))
            )

    # Some permit types only appear in the schedules file. Register them too
    # so the permits table stays complete.
    for permit_type in schedules.keys():
        if permit_type not in mapping:
            is_commuter = 1 if "commuter" in permit_type.lower() else 0
            permit_rows.append((permit_type, is_commuter))

    cur.executemany(
        "INSERT OR IGNORE INTO permits (permit_type, is_commuter) VALUES (?, ?)",
        permit_rows,
    )
    cur.executemany(
        "INSERT OR IGNORE INTO permit_lots (permit_type, lot_id, lot_name) "
        "VALUES (?, ?, ?)",
        permit_lot_rows,
    )

    schedule_rows = []
    slot_rows = []
    for permit_type, by_lot in schedules.items():
        for lot_id, info in by_lot.items():
            schedule_rows.append(
                (
                    permit_type,
                    str(lot_id),
                    info.get("time_text_1"),
                    info.get("time_text_2"),
                )
            )
            day_schedules = info.get("schedule") or []
            for weekday, slots in enumerate(day_schedules):
                for slot_index, slot in enumerate(slots or []):
                    start_min = parse_time_to_minutes(slot.get("start") or "")
                    end_min = parse_time_to_minutes(slot.get("end") or "")
                    if start_min is None or end_min is None:
                        continue
                    slot_rows.append(
                        (
                            permit_type,
                            str(lot_id),
                            weekday,
                            slot_index,
                            start_min,
                            end_min,
                        )
                    )

    cur.executemany(
        "INSERT OR REPLACE INTO permit_schedules "
        "(permit_type, lot_id, time_text_1, time_text_2) VALUES (?, ?, ?, ?)",
        schedule_rows,
    )
    cur.executemany(
        """
        INSERT OR REPLACE INTO permit_schedule_slots
            (permit_type, lot_id, weekday, slot_index, start_minute, end_minute)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        slot_rows,
    )

    return (
        len(permit_rows),
        len(permit_lot_rows),
        len(schedule_rows),
        len(slot_rows),
    )


def populate_fts(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO lots_fts (map_id, short_name, property_name, campus)
        SELECT map_id,
               COALESCE(short_name, ''),
               COALESCE(property_name, ''),
               COALESCE(campus, '')
        FROM lots
        """
    )
    cur.execute(
        """
        INSERT INTO buildings_fts (name, name_text, address, campus)
        SELECT name, name, COALESCE(address, ''), COALESCE(campus, '')
        FROM buildings
        """
    )
    cur.execute(
        """
        INSERT INTO places_fts (id, name, aliases, address)
        SELECT id, COALESCE(name, ''), COALESCE(aliases, ''), COALESCE(address, '')
        FROM places
        """
    )


def write_meta(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        [
            ("schema_version", str(SCHEMA_VERSION)),
            (
                "generated_at",
                dt.datetime.now(dt.timezone.utc)
                .replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z"),
            ),
        ],
    )


def build(sources: Path, output: Path) -> None:
    required = {
        "lots":     sources / "rutgers_parking_data.json",
        "builds":   sources / "buildings.json",
        "places":   sources / "locations.json",
        "mapping":  sources / "permit_mapping.json",
        "schedule": sources / "permit_schedules.json",
    }
    for label, path in required.items():
        if not path.is_file():
            raise SystemExit(f"Missing source JSON for {label}: {path}")

    lots_json      = load_json(required["lots"])
    buildings_json = load_json(required["builds"])
    places_json    = load_json(required["places"])
    mapping_json   = load_json(required["mapping"])
    schedules_json = load_json(required["schedule"])

    output.parent.mkdir(parents=True, exist_ok=True)
    tmp_output = output.with_suffix(output.suffix + ".tmp")
    if tmp_output.exists():
        tmp_output.unlink()
    if output.exists():
        output.unlink()

    conn = sqlite3.connect(str(tmp_output))
    try:
        conn.executescript(SCHEMA_SQL)
        with conn:
            n_lots = insert_lots(conn, lots_json)
            n_buildings = insert_buildings(conn, buildings_json)
            n_places = insert_places(conn, places_json)
            n_permits, n_permit_lots, n_schedules, n_slots = insert_permits(
                conn, mapping_json, schedules_json
            )
            populate_fts(conn)
            write_meta(conn)
        conn.execute("VACUUM")
        conn.execute("ANALYZE")
    finally:
        conn.close()

    tmp_output.replace(output)

    kb = output.stat().st_size / 1024
    try:
        display_path = str(output.relative_to(IOS_NATIVE_ROOT.parent))
    except ValueError:
        # Allow callers (e.g. CI) to write verification DBs outside the repo.
        display_path = str(output)
    print(f"Wrote {display_path} ({kb:,.1f} KB)")
    print(
        "  lots={lots}  buildings={b}  places={p}  permits={perm}  "
        "permit_lots={pl}  schedules={s}  slots={sl}".format(
            lots=n_lots, b=n_buildings, p=n_places,
            perm=n_permits, pl=n_permit_lots, s=n_schedules, sl=n_slots,
        )
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sources",
        type=Path,
        default=DEFAULT_SOURCES,
        help=f"Directory containing the canonical JSON files (default: {DEFAULT_SOURCES})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output .sqlite path (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args(argv)
    build(args.sources.resolve(), args.output.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
