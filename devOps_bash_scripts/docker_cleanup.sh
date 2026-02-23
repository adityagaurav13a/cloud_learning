#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : docker_cleanup.sh
# Purpose: Remove unused Docker containers,
#          images, volumes, networks
# Usage  : bash docker_cleanup.sh
# ─────────────────────────────────────────────

echo "======================================"
echo " Docker Cleanup — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

# Show before
echo "--- Before Cleanup ---"
docker system df

echo ""
echo "--- Removing stopped containers ---"
docker container prune -f

echo ""
echo "--- Removing dangling images ---"
docker image prune -f

echo ""
echo "--- Removing unused volumes ---"
docker volume prune -f

echo ""
echo "--- Removing unused networks ---"
docker network prune -f

echo ""
echo "--- After Cleanup ---"
docker system df

echo ""
echo "✅ Docker cleanup complete!"
echo "======================================"
