#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : service_monitor.sh
# Purpose: Monitor services and auto-restart
#          if they go down
# Usage  : bash service_monitor.sh
#          or add to crontab:
#          */5 * * * * bash /path/service_monitor.sh
# ─────────────────────────────────────────────

# ── CONFIG (edit these) ───────────────────────
SERVICES=("nginx" "docker" "ssh")    # services to monitor
LOG_FILE="/var/log/service_monitor.log"
# ─────────────────────────────────────────────

DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "======================================"
echo " Service Monitor — $DATE"
echo "======================================"

for SERVICE in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$SERVICE"; then
        echo "✅ $SERVICE is running"
    else
        echo "❌ $SERVICE is DOWN — attempting restart..."
        systemctl restart "$SERVICE"

        # verify restart worked
        sleep 2
        if systemctl is-active --quiet "$SERVICE"; then
            echo "✅ $SERVICE restarted successfully"
            echo "$DATE — $SERVICE restarted successfully" >> $LOG_FILE
        else
            echo "🚨 $SERVICE FAILED to restart!"
            echo "$DATE — $SERVICE FAILED to restart" >> $LOG_FILE
        fi
    fi
done

echo "======================================"
echo "Log: $LOG_FILE"
