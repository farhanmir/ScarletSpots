# iOS-native data pipeline

The iOS-native target ships a bundled SQLite database (`scarletspots.sqlite`)
instead of decoding large JSON blobs at startup. JSON stays the canonical
source of truth — the database is a build artifact generated from it.

## Layout

```
ios-native/
├── data-sources/                          # canonical JSON (source of truth)
│   ├── rutgers_parking_data.json
│   ├── buildings.json
│   ├── locations.json
│   ├── permit_mapping.json
│   └── permit_schedules.json
├── scripts/
│   └── build_sqlite.py                    # generator
└── ScarletSpots/
    └── Resources/
        └── scarletspots.sqlite            # generated, bundled in the app
```

## Rebuilding the database

Any time a file under `data-sources/` changes, regenerate:

```bash
python ios-native/scripts/build_sqlite.py
```

The script is a single Python stdlib file (no deps) — it reads the canonical
JSON, creates the schema, inserts rows, builds the FTS5 indexes, `VACUUM`s,
and writes `ios-native/ScarletSpots/Resources/scarletspots.sqlite`. Commit the
regenerated file alongside your JSON changes so CI and TestFlight builds pick
it up automatically.

To verify a generated DB matches the committed bundle logically (ignoring file
layout differences), run:

```bash
python ios-native/scripts/compare_sqlite.py \
  ios-native/ScarletSpots/Resources/scarletspots.sqlite \
  /tmp/scarletspots.verify.sqlite
```

Optional flags:

- `--sources PATH` — alternate directory of source JSON
- `--output PATH` — alternate output path

## Schema

Managed in `build_sqlite.py` (`SCHEMA_SQL`). Highlights:

- `lots` — one row per lot, scalars only
- `lot_polygons` — outer + interior rings, points packed as little-endian
  doubles in a `BLOB` column for fast Swift-side decoding
- `buildings`, `places` — Search tab lookup tables
- `permits`, `permit_lots` — permit → allowed lot mapping
- `permit_schedules` — per `(permit, lot)` free-form schedule text
- `permit_schedule_slots` — per `(permit, lot, weekday)` time windows
- `lots_fts`, `buildings_fts`, `places_fts` — FTS5 virtual tables with the
  `trigram` tokenizer for substring-style typeahead
- `meta` — `schema_version`, `generated_at`

Never edit `scarletspots.sqlite` by hand. Always go through the generator so
JSON and SQLite stay in sync.
