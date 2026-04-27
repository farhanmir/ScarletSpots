# iOS Native Data Scripts

These scripts keep the bundled SQLite database aligned with the canonical Rutgers JSON sources.

## Source of truth

- `ios/data-sources/`

## Generated artifact

- `ios/ScarletSpots/Resources/scarletspots.sqlite`

## Main commands

Rebuild the bundled database:

```bash
python ios/scripts/build_sqlite.py
```

Compare two databases for logical equality:

```bash
python ios/scripts/compare_sqlite.py \
  ios/ScarletSpots/Resources/scarletspots.sqlite \
  path/to/other.sqlite
```

## Working rule

Do not hand-edit the SQLite file. Update the JSON sources, regenerate the database, and commit both the source change and the rebuilt artifact.

Last reviewed: 2026-04-26
