#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : cron_manager.sh
# Purpose: Add, list, remove cron jobs easily
#          without manually editing crontab
# Usage  : bash cron_manager.sh list
#          bash cron_manager.sh add
#          bash cron_manager.sh remove
# ─────────────────────────────────────────────

ACTION=$1

echo "======================================"
echo " Cron Manager — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

list_crons() {
    echo "--- Current Cron Jobs ---"
    crontab -l 2>/dev/null || echo "No cron jobs found"
}

add_cron() {
    echo "--- Add New Cron Job ---"
    echo ""
    echo "Schedule presets:"
    echo "  1) Every minute        (* * * * *)"
    echo "  2) Every 5 minutes     (*/5 * * * *)"
    echo "  3) Every hour          (0 * * * *)"
    echo "  4) Every day at 2am    (0 2 * * *)"
    echo "  5) Every Sunday at 3am (0 3 * * 0)"
    echo "  6) Custom"
    echo ""
    read -p "Choose schedule (1-6): " CHOICE

    case $CHOICE in
        1) SCHEDULE="* * * * *" ;;
        2) SCHEDULE="*/5 * * * *" ;;
        3) SCHEDULE="0 * * * *" ;;
        4) SCHEDULE="0 2 * * *" ;;
        5) SCHEDULE="0 3 * * 0" ;;
        6) read -p "Enter custom schedule: " SCHEDULE ;;
    esac

    read -p "Enter command to run: " CMD

    CRON_JOB="$SCHEDULE $CMD"
    ( crontab -l 2>/dev/null; echo "$CRON_JOB" ) | crontab -

    echo ""
    echo "✅ Cron job added: $CRON_JOB"
    echo ""
    list_crons
}

remove_cron() {
    echo "--- Remove Cron Job ---"
    crontab -l 2>/dev/null | nl -ba
    echo ""
    read -p "Enter line number to remove: " LINE

    crontab -l 2>/dev/null | sed "${LINE}d" | crontab -
    echo "✅ Cron job on line $LINE removed"
    echo ""
    list_crons
}

# ── Automating DevOps Scripts via Cron ────────
setup_devops_crons() {
    SCRIPTS_DIR=$(dirname "$0")
    echo "--- Setting up DevOps automation crons ---"

    ( crontab -l 2>/dev/null
      echo "*/5 * * * * bash $SCRIPTS_DIR/04_service_monitor.sh >> /var/log/service_monitor.log 2>&1"
      echo "0 2 * * * bash $SCRIPTS_DIR/02_db_backup.sh >> /var/log/db_backup.log 2>&1"
      echo "0 3 * * 0 bash $SCRIPTS_DIR/05_log_cleanup.sh >> /var/log/log_cleanup.log 2>&1"
      echo "0 4 * * * bash $SCRIPTS_DIR/03_docker_cleanup.sh >> /var/log/docker_cleanup.log 2>&1"
    ) | crontab -

    echo "✅ DevOps crons set up:"
    echo "   Every 5 min  → service_monitor"
    echo "   Daily 2am    → db_backup"
    echo "   Sunday 3am   → log_cleanup"
    echo "   Daily 4am    → docker_cleanup"
}

case $ACTION in
    list)           list_crons ;;
    add)            add_cron ;;
    remove)         remove_cron ;;
    setup-devops)   setup_devops_crons ;;
    *)
        echo "Usage: bash cron_manager.sh [list|add|remove|setup-devops]"
        echo ""
        echo "  list          → show all cron jobs"
        echo "  add           → add a new cron job interactively"
        echo "  remove        → remove a cron job by line number"
        echo "  setup-devops  → auto-schedule all DevOps scripts"
        ;;
esac

echo "======================================"
