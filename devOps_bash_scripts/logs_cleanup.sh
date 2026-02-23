#!/bin/bash
# ─────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : log_cleanup.sh
# Purpose: Rotate, compress and clean old logs
# Usage  : bash log_cleanup.sh
# ─────────────────────────────────────────────

# ── CONFIG (edit these) ───────────────────────
LOG_DIR="/var/log"              # directory to clean
COMPRESS_AFTER_DAYS=7           # compress logs older than N days
DELETE_AFTER_DAYS=30            # delete logs older than N days
# ─────────────────────────────────────────────

echo "======================================"
echo " Log Cleanup — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

echo "--- Disk before ---"
du -sh $LOG_DIR 2>/dev/null

echo ""
echo "--- Compressing logs older than $COMPRESS_AFTER_DAYS days ---"
find $LOG_DIR -name "*.log" -mtime +$COMPRESS_AFTER_DAYS ! -name "*.gz" -exec gzip -v {} \;

echo ""
echo "--- Deleting compressed logs older than $DELETE_AFTER_DAYS days ---"
find $LOG_DIR -name "*.gz" -mtime +$DELETE_AFTER_DAYS -delete -print

echo ""
echo "--- Deleting empty log files ---"
find $LOG_DIR -name "*.log" -empty -delete -print

echo ""
echo "--- Disk after ---"
du -sh $LOG_DIR 2>/dev/null

echo ""
echo "✅ Log cleanup done!"
echo "======================================"
