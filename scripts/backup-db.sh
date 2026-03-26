#!/usr/bin/env bash

set -euo pipefail

DATABASE_PATH="${DATABASE_PATH:-./data/budget.db}"
BACKUP_DIR="${BACKUP_DIR:-./data/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_COMPRESS="${BACKUP_COMPRESS:-1}"

if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DATABASE_PATH" ]; then
  echo "Database file not found: $DATABASE_PATH" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_path="${BACKUP_DIR}/budget-${timestamp}.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DATABASE_PATH" ".timeout 5000" ".backup '$backup_path'"
else
  # Copy fallback is only safe when there is no active WAL file.
  wal_file="${DATABASE_PATH}-wal"
  if [ -s "$wal_file" ]; then
    echo "sqlite3 is not available and WAL file is active: $wal_file" >&2
    echo "Install sqlite3 in the runtime image for consistent online backups." >&2
    exit 1
  fi
  cp "$DATABASE_PATH" "$backup_path"
fi

if [ ! -s "$backup_path" ]; then
  echo "Backup file is empty: $backup_path" >&2
  exit 1
fi

compress_flag="$(printf '%s' "$BACKUP_COMPRESS" | tr '[:upper:]' '[:lower:]')"
if [ "$compress_flag" = "1" ] || [ "$compress_flag" = "true" ] || [ "$compress_flag" = "yes" ]; then
  gzip -f "$backup_path"
  backup_path="${backup_path}.gz"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "budget-*.db" -o -name "budget-*.db.gz" \) -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "Backup created: $backup_path"
