#!/usr/bin/env bash
# =============================================================================
# bump_version.sh — Bump the SemVer for one ScarletSpots component.
#
# Usage:
#   bash scripts/bump_version.sh <component> <part>
#
# Arguments:
#   component   backend | ios | website
#   part        major | minor | patch
#
# Examples:
#   bash scripts/bump_version.sh backend minor    # 0.1.0 → 0.2.0
#   bash scripts/bump_version.sh ios patch        # 1.0.0 → 1.0.1
#   bash scripts/bump_version.sh website major    # 1.0.0 → 2.0.0
# =============================================================================
set -euo pipefail

COMPONENT="${1:-}"
PART="${2:-}"

# ── Validate args ─────────────────────────────────────────────────────────────
if [[ -z "$COMPONENT" || -z "$PART" ]]; then
  echo "Usage: bash scripts/bump_version.sh <backend|ios|website> <major|minor|patch>" >&2
  exit 1
fi

case "$COMPONENT" in
  backend)  VERSION_FILE="backend/VERSION" ;;
  ios)      VERSION_FILE="ios/ScarletSpots/VERSION" ;;
  website)  VERSION_FILE="website/VERSION" ;;
  *)
    echo "Unknown component: '$COMPONENT'. Use backend, ios, or website." >&2
    exit 1
    ;;
esac

case "$PART" in
  major|minor|patch) ;;
  *)
    echo "Unknown part: '$PART'. Use major, minor, or patch." >&2
    exit 1
    ;;
esac

# ── Read current version ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FILE="$REPO_ROOT/$VERSION_FILE"

if [[ ! -f "$FILE" ]]; then
  echo "Version file not found: $FILE" >&2
  exit 1
fi

CURRENT="$(cat "$FILE" | tr -d '[:space:]')"

# Validate semver format
if ! echo "$CURRENT" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Invalid SemVer in $FILE: '$CURRENT'" >&2
  exit 1
fi

MAJOR="$(echo "$CURRENT" | cut -d. -f1)"
MINOR="$(echo "$CURRENT" | cut -d. -f2)"
PATCH="$(echo "$CURRENT" | cut -d. -f3)"

# ── Bump ──────────────────────────────────────────────────────────────────────
case "$PART" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "$NEW" > "$FILE"

echo ""
echo "✅  $COMPONENT: $CURRENT → $NEW"
echo "    $FILE updated."
echo ""
echo "Next steps:"
echo "  1. If bumping iOS: also update MARKETING_VERSION in ios/ScarletSpots/project.yml"
echo "     (or just re-run xcodegen — it reads from the xcconfig / project settings)."
echo "  2. Commit: git add $VERSION_FILE && git commit -m 'chore($COMPONENT): bump version to $NEW'"
echo "  3. Tag (optional): git tag '$COMPONENT-v$NEW'"
