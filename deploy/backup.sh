#!/usr/bin/env bash
# Nightly database backup: a compressed dump in ~/insider-backups, keeping the last 14 days.
# Restore one with:  gunzip -c FILE.sql.gz | psql "$DATABASE_URL"
set -euo pipefail
DB_NAME="${DB_NAME:-insider_live}"
OUT="$HOME/insider-backups"
mkdir -p "$OUT"
FILE="$OUT/$DB_NAME-$(date -u +%Y-%m-%d).sql.gz"
PGPASSWORD="$(cat "$HOME/.insider-db-pass")" pg_dump -h 127.0.0.1 -U insider "$DB_NAME" | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
# Drop dumps older than 14 days (only this folder's own .sql.gz files).
find "$OUT" -maxdepth 1 -name "$DB_NAME-*.sql.gz" -mtime +14 -delete
echo "$(date -u +%FT%TZ) backed up $FILE ($(du -h "$FILE" | cut -f1))"
