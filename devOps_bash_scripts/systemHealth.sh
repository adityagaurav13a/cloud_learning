#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : system_health.sh
# Purpose: Check CPU, Memory, Disk, Network
# Usage  : bash system_health.sh
# ─────────────────────────────────────────────

THRESHOLD=80
LOG_FILE="/var/log/system_health.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "======================================"
echo " System Health Report — $DATE"
echo "======================================"

# CPU
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d. -f1)
echo "CPU Usage     : $CPU%"
[ "$CPU" -gt "$THRESHOLD" ] && echo "⚠️  WARNING: CPU usage is high!"

# Memory
MEM_TOTAL=$(free -m | awk '/Mem/{print $2}')
MEM_USED=$(free -m | awk '/Mem/{print $3}')
MEM_PCT=$(awk "BEGIN {printf \"%.0f\", ($MEM_USED/$MEM_TOTAL)*100}")
echo "Memory Usage  : ${MEM_USED}MB / ${MEM_TOTAL}MB ($MEM_PCT%)"
[ "$MEM_PCT" -gt "$THRESHOLD" ] && echo "⚠️  WARNING: Memory usage is high!"

# Disk
echo ""
echo "--- Disk Usage ---"
df -h | grep -vE 'tmpfs|udev|loop' | awk 'NR==1 || /\/$/{print}'

# Top 5 processes by CPU
echo ""
echo "--- Top 5 Processes (CPU) ---"
ps aux --sort=-%cpu | head -6 | awk '{printf "%-10s %-8s %-8s %s\n", $1, $2, $3, $11}'

# Uptime and load
echo ""
echo "--- Uptime ---"
uptime

echo "======================================"
echo "Report saved to $LOG_FILE"
echo "$DATE — CPU:$CPU% MEM:$MEM_PCT%" >> $LOG_FILE
