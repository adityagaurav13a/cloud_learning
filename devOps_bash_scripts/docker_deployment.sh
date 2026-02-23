#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : docker_deploy.sh
# Purpose: Pull latest Docker image and redeploy
#          container with zero downtime
# Usage  : bash docker_deploy.sh
# ─────────────────────────────────────────────

# ── CONFIG (edit these) ───────────────────────
IMAGE="aditygau/django-app:v1"    # docker image to deploy
CONTAINER_NAME="django_app"        # container name
HOST_PORT=8000                     # port on host
CONTAINER_PORT=8000                # port inside container
VOLUME="django_db:/app/db.sqlite3" # optional volume (leave empty to skip)
LOG_FILE="/var/log/docker_deploy.log"
# ─────────────────────────────────────────────

DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "======================================"
echo " Docker Deploy — $DATE"
echo " Image: $IMAGE"
echo "======================================"

echo "--- Pulling latest image ---"
docker pull $IMAGE

echo ""
echo "--- Stopping old container ---"
docker stop $CONTAINER_NAME 2>/dev/null && echo "Stopped: $CONTAINER_NAME" || echo "No running container found"
docker rm   $CONTAINER_NAME 2>/dev/null && echo "Removed: $CONTAINER_NAME" || echo "No container to remove"

echo ""
echo "--- Starting new container ---"
if [ -n "$VOLUME" ]; then
    docker run -d \
        -p ${HOST_PORT}:${CONTAINER_PORT} \
        -v $VOLUME \
        --name $CONTAINER_NAME \
        --restart unless-stopped \
        $IMAGE
else
    docker run -d \
        -p ${HOST_PORT}:${CONTAINER_PORT} \
        --name $CONTAINER_NAME \
        --restart unless-stopped \
        $IMAGE
fi

echo ""
echo "--- Container Status ---"
sleep 2
docker ps | grep $CONTAINER_NAME && echo "✅ Container running!" || echo "❌ Container failed to start"

echo ""
echo "--- Logs (last 10 lines) ---"
docker logs --tail 10 $CONTAINER_NAME

echo "$DATE — Deployed $IMAGE" >> $LOG_FILE
echo "======================================"
