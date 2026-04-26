# iOS Native Data Scripts

These scripts keep the bundled SQLite database in sync with the canonical JSON sources.

## Source of truth

`ios-native/data-sources/`

## Generated artifact

`ios-native/ScarletSpots/Resources/scarletspots.sqlite`

## Main commands

Rebuild:

```bash
python ios-native/scripts/build_sqlite.py
```

Verify two databases match logically:

```bash
python ios-native/scripts/compare_sqlite.py \
  ios-native/ScarletSpots/Resources/scarletspots.sqlite \
  path/to/other.sqlite
```

## Rule

Do not hand-edit the SQLite file. Update JSON, regenerate SQLite, commit both.

Last reviewed: 2026-04-26
