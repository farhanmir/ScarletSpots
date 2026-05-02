#!/bin/bash

# =============================================================================
# sysup.sh - Safe system upkeep for Ubuntu hosts with Docker
#
# This script handles package updates, cleanup, and safe Docker resource 
# pruning to keep the host running smoothly.
# =============================================================================

set -euo pipefail

echo "=== Starting system upkeep ==="
echo "Date: $(date)"
echo "Hostname: $(hostname)"
echo ""

# --- System & package maintenance ---
echo ">>> Updating host package lists..."
sudo apt update

echo ">>> Upgrading host packages..."
sudo apt upgrade -y

echo ">>> Removing unnecessary packages..."
sudo apt autoremove -y

echo ">>> Cleaning package cache..."
sudo apt autoclean -y
sudo apt clean -y

# --- Docker cleanup (safe) ---
if command -v docker >/dev/null 2>&1; then
    echo ">>> Docker cleanup: removing unused resources"
    # Only remove stopped containers
    sudo docker container prune -f
    # Remove dangling (unused) images only
    sudo docker image prune -f
    # Remove unused networks (not active)
    sudo docker network prune -f
else
    echo ">>> Docker not installed, skipping Docker cleanup"
fi

# --- Kernel & system ---
echo ">>> Checking if a reboot is required..."
if [ -f /var/run/reboot-required ]; then
    echo "Reboot required due to kernel or critical updates."
    echo "You can reboot now with: sudo reboot"
else
    echo "No reboot required."
fi

echo ""
echo "=== System upkeep completed ==="
df -h
echo "Date: $(date)"
