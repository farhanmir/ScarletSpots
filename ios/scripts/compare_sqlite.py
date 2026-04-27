#!/usr/bin/env python3
"""Compare two SQLite databases by logical table contents.

This intentionally ignores low-level file/page layout differences so it can be
used as a CI drift guard across environments with different SQLite builds.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from typing import Iterable


def connect(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise SystemExit(f"SQLite file not found: {path}")
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


def user_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    ).fetchall()
    return [row["name"] for row in rows]


def table_create_sql(conn: sqlite3.Connection, table: str) -> str:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row["sql"] if row and row["sql"] else ""


def primary_key_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    ordered = sorted(
        (row for row in rows if int(row["pk"]) > 0),
        key=lambda r: int(r["pk"]),
    )
    return [row["name"] for row in ordered]


def all_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [row["name"] for row in rows]


def table_order_by(conn: sqlite3.Connection, table: str) -> str:
    pk_cols = primary_key_columns(conn, table)
    if pk_cols:
        return ", ".join(pk_cols)
    cols = all_columns(conn, table)
    return ", ".join(cols) if cols else "rowid"


def normalize_value(value):
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, bytes):
        return {"__blob_hex__": value.hex()}
    return value


def row_digest(
    conn: sqlite3.Connection,
    table: str,
    columns: list[str],
    order_by: str,
) -> tuple[int, str]:
    query = f"SELECT * FROM {table} ORDER BY {order_by}"
    hasher = hashlib.sha256()
    count = 0
    for row in conn.execute(query):
        payload = {col: normalize_value(row[col]) for col in columns}
        # generated_at is intentionally non-deterministic on each rebuild.
        if table == "meta" and payload.get("key") == "generated_at":
            payload["value"] = "__IGNORED_GENERATED_AT__"
        line = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        hasher.update(line.encode("utf-8"))
        hasher.update(b"\n")
        count += 1
    return count, hasher.hexdigest()


def compare_indexes(
    left: sqlite3.Connection,
    right: sqlite3.Connection,
    table: str,
) -> tuple[bool, str]:
    left_sql = table_create_sql(left, table)
    right_sql = table_create_sql(right, table)
    if left_sql != right_sql:
        return False, f"schema differs for table '{table}'"

    columns = all_columns(left, table)
    order_by = table_order_by(left, table)
    left_count, left_hash = row_digest(left, table, columns, order_by)
    right_count, right_hash = row_digest(right, table, columns, order_by)

    if left_count != right_count:
        return False, f"row count differs for table '{table}': left={left_count}, right={right_count}"
    if left_hash != right_hash:
        return False, f"contents differ for table '{table}' (hash mismatch)"
    return True, f"{table}: rows={left_count} hash={left_hash[:12]}"


def compare_databases(left_path: Path, right_path: Path) -> int:
    left = connect(left_path)
    right = connect(right_path)
    try:
        left_tables = user_tables(left)
        right_tables = user_tables(right)
        if left_tables != right_tables:
            print("Table sets differ:", file=sys.stderr)
            print(f"  left : {left_tables}", file=sys.stderr)
            print(f"  right: {right_tables}", file=sys.stderr)
            return 1

        failed = False
        for table in left_tables:
            ok, message = compare_indexes(left, right, table)
            stream = sys.stdout if ok else sys.stderr
            print(message, file=stream)
            if not ok:
                failed = True

        if failed:
            print(
                "\nSQLite drift detected. Regenerate and commit the bundled database:\n"
                "  python ios/scripts/build_sqlite.py\n"
                "  git add ios/ScarletSpots/Resources/scarletspots.sqlite",
                file=sys.stderr,
            )
            return 1
        return 0
    finally:
        left.close()
        right.close()


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("left", type=Path, help="Expected (committed) .sqlite file")
    parser.add_argument("right", type=Path, help="Generated .sqlite file to compare")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    return compare_databases(args.left.resolve(), args.right.resolve())


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
