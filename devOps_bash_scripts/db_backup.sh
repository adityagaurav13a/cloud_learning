#!/bin/bash
# ────────────────────────────────────────────
# Author : Aditya Gaurav
# Date   : 20 Feb 2026
# Script : db_backup.sh
# Purpose: Backup any SQLite / MySQL / Postgres
#          database locally with rotation
# Usage  : bash db_backup.sh
# ─────────────────────────────────────────────

# ── CONFIG (edit these) ───────────────────────
DB_TYPE="sqlite"               # sqlite | mysql | postgres
DB_NAME="db.sqlite3"           # DB name or path for sqlite
DB_USER="root"                 # for mysql/postgres only
DB_HOST="localhost"            # for mysql/postgres only
BACKUP_DIR="./backups"         # where to store backups
MAX_BACKUPS=5                  # how many backups to keep
# ─────────────────────────────────────────────

DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

echo "======================================"
echo " DB Backup — $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

if [ "$DB_TYPE" = "sqlite" ]; then
    BACKUP_FILE="$BACKUP_DIR/${DB_NAME%.sqlite3}_$DATE.sqlite3"
    cp $DB_NAME $BACKUP_FILE
    echo "✅ SQLite backup created: $BACKUP_FILE"

elif [ "$DB_TYPE" = "mysql" ]; then
    BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$DATE.sql.gz"
    mysqldump -u$DB_USER -h$DB_HOST $DB_NAME | gzip > $BACKUP_FILE
    echo "✅ MySQL backup created: $BACKUP_FILE"

elif [ "$DB_TYPE" = "postgres" ]; then
    BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$DATE.sql.gz"
    pg_dump -U $DB_USER -h $DB_HOST $DB_NAME | gzip > $BACKUP_FILE
    echo "✅ Postgres backup created: $BACKUP_FILE"
fi

# Rotate — keep only MAX_BACKUPS latest
echo ""
echo "--- Rotating old backups (keeping $MAX_BACKUPS) ---"
ls -t $BACKUP_DIR/* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -v

echo ""
echo "--- Current Backups ---"
ls -lh $BACKUP_DIR
echo "======================================"
