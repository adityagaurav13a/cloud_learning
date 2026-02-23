#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : git_deploy.sh
# Purpose: Pull latest git changes and redeploy
#          only if new commits exist
# Usage  : bash git_deploy.sh
# ─────────────────────────────────────────────

# ── CONFIG (edit these) ───────────────────────
REPO_DIR="/app"                        # path to your project
BRANCH="main"                          # branch to deploy
RESTART_CMD="systemctl restart gunicorn"  # command to restart app
LOG_FILE="/var/log/git_deploy.log"
# ─────────────────────────────────────────────

DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "======================================"
echo " Git Auto Deploy — $DATE"
echo "======================================"

cd $REPO_DIR || { echo "❌ Repo dir not found: $REPO_DIR"; exit 1; }

echo "Fetching latest from origin/$BRANCH..."
git fetch origin

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ Already up to date — no deployment needed"
    exit 0
fi

echo "🔄 New changes detected!"
echo "   Current : $LOCAL"
echo "   Latest  : $REMOTE"

echo ""
echo "--- Pulling changes ---"
git pull origin $BRANCH

echo ""
echo "--- Installing dependencies ---"
pip install -r requirements.txt --quiet

echo ""
echo "--- Running migrations ---"
python manage.py migrate

echo ""
echo "--- Restarting app ---"
eval $RESTART_CMD

echo ""
echo "✅ Deployed successfully at $DATE"
echo "$DATE — Deployed $LOCAL → $REMOTE" >> $LOG_FILE
echo "======================================"
