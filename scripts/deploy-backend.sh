#!/usr/bin/env bash
set -e

# =============================================================================
# deploy-backend.sh — Pull latest code and restart the backend container.
#
# This script ensures that the exact Git commit SHA is captured and baked
# into the Docker image at build time for version tracking.
# =============================================================================

echo "🚀 Updating ScarletSpots via Docker..."

# 1. Navigate to the project root where docker-compose.yml lives
PROJECT_ROOT="$HOME/ScarletSpots"
if [ ! -d "$PROJECT_ROOT" ]; then
    # Fallback to current directory if ~/ScarletSpots doesn't exist
    PROJECT_ROOT="$(pwd)"
fi
cd "$PROJECT_ROOT"

# 2. Pull latest code
echo "📦 Pulling latest code..."
git fetch origin
git pull origin main

# 3. Rebuild and restart the container
echo "🏗️  Rebuilding and restarting the backend container..."

# Capture the exact commit hash we are about to deploy
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# The --build flag forces Docker to run your Dockerfile again.
# We use sudo -E to pass the GIT_SHA variable into the docker build environment.
# Specifying 'backend' ensures we don't unnecessarily restart Postgres or Redis.
GIT_SHA=$GIT_SHA sudo -E docker compose up -d --build backend

# 4. Housekeeping
echo "🧹 Cleaning up dangling Docker images to save space..."
sudo docker image prune -f

echo "✅ Update complete! The containerized Ferrari (SHA: $GIT_SHA) is back on the track."
