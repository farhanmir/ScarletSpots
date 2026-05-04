#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# deploy-backend.sh — Pull latest code and restart the backend container.
#
# This script ensures that the exact Git commit SHA is captured and baked
# into the Docker image at build time for version tracking.
# =============================================================================

echo "🚀 Updating ScarletSpots via Docker..."

# 1. Navigate to the project root where docker-compose.yml lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found in $PROJECT_ROOT" >&2
    exit 1
fi

cd "$PROJECT_ROOT"

# 2. Pre-flight checks
if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is not installed or not in PATH." >&2
    exit 1
fi

if ! command -v git >/dev/null 2>&1; then
    echo "Error: git is not installed or not in PATH." >&2
    exit 1
fi

# 3. Pull latest code
echo "📦 Pulling latest code..."
git fetch origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git pull origin "$BRANCH"

# 4. Rebuild and restart the container
echo "🏗️  Rebuilding and restarting the backend container..."

# Capture the exact commit hash we are about to deploy
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

sudo GIT_SHA="$GIT_SHA" docker compose up -d --build --build-arg GIT_SHA="$GIT_SHA" backend

# 5. Housekeeping
echo "🧹 Cleaning up dangling Docker images to save space..."
sudo docker image prune -f

echo "✅ Update complete! The containerized Ferrari (SHA: $GIT_SHA) is back on the track."
