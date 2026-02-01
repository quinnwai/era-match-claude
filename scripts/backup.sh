#!/usr/bin/env bash
# Back up the query log database to a GCS bucket.
# Usage: ./scripts/backup.sh
#
# Intended to run as a daily cron job on the VM:
#   0 3 * * * /opt/era-match-claude/scripts/backup.sh >> /var/log/era-backup.log 2>&1

set -euo pipefail

BUCKET="${GCS_BACKUP_BUCKET:?Set GCS_BACKUP_BUCKET env var (e.g. gs://era-match-backups)}"
REPO_DIR="/opt/era-match-claude"
DATE=$(date +%Y-%m-%d)

# Back up query log
DB_FILE="$REPO_DIR/data/era_query_log.db"
if [ -f "$DB_FILE" ]; then
  # Use sqlite3 .backup for a consistent copy (avoids partial writes)
  BACKUP_FILE="/tmp/era_query_log_${DATE}.db"
  sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
  gsutil cp "$BACKUP_FILE" "$BUCKET/query_log/era_query_log_${DATE}.db"
  rm "$BACKUP_FILE"
  echo "[$DATE] Backed up query log to $BUCKET/query_log/"
else
  echo "[$DATE] No query log found at $DB_FILE, skipping."
fi
