#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$script_directory/common.sh"

[[ $# -eq 2 ]] || backup_die "Usage: $0 OUTPUT_DIRECTORY PASSPHRASE_FILE"

output_directory=$1
passphrase_file=$2
database_name=${BACKUP_DATABASE_NAME:-}

[[ -n "$database_name" ]] || backup_die "BACKUP_DATABASE_NAME is required."
backup_validate_database_name "$database_name"
backup_require_passphrase_file "$passphrase_file"
backup_require_runtime

umask 077
mkdir -p -- "$output_directory"
[[ -d "$output_directory" && ! -L "$output_directory" ]] ||
  backup_die "The output directory must be a real directory."

timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
backup_basename="webhost-billing-${database_name}-${timestamp}.dump.gpg"
backup_file="$output_directory/$backup_basename"
[[ ! -e "$backup_file" ]] || backup_die "The target backup already exists."

temporary_file=$(mktemp "$output_directory/.webhost-billing-backup.XXXXXXXXXX")
cleanup() {
  rm -f -- "$temporary_file"
}
trap cleanup EXIT

backup_compose exec -T \
  -e BACKUP_TARGET_DATABASE="$database_name" \
  "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu '
    exec pg_dump \
      --username "$POSTGRES_USER" \
      --dbname "$BACKUP_TARGET_DATABASE" \
      --format custom \
      --compress zstd:9 \
      --no-owner \
      --no-privileges
  ' | backup_gpg_encrypt "$passphrase_file" "$temporary_file"

backup_verify_archive_contents "$temporary_file" "$passphrase_file"
mv -- "$temporary_file" "$backup_file"
trap - EXIT

backup_hash=$(sha256sum -- "$backup_file" | cut -d ' ' -f1)
printf '%s  %s\n' "$backup_hash" "$backup_basename" >"$backup_file.sha256"
postgres_version=$(
  backup_compose exec -T "$BACKUP_POSTGRES_SERVICE" pg_dump --version |
    tr -d '\r\n'
)
application_commit=$(git -C "$BACKUP_REPOSITORY_ROOT" rev-parse HEAD 2>/dev/null || printf 'unknown')
migration_count=$(
  backup_compose exec -T \
    -e BACKUP_TARGET_DATABASE="$database_name" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      psql --username "$POSTGRES_USER" --dbname "$BACKUP_TARGET_DATABASE" \
        --no-align --tuples-only --set ON_ERROR_STOP=1 \
        --command "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
    '
)
printf '{\n  "formatVersion": 1,\n  "createdAt": "%s",\n  "databaseName": "%s",\n  "archiveFormat": "PostgreSQL custom",\n  "encryption": "OpenPGP symmetric AES-256 with iterated SHA-512 S2K",\n  "postgresClient": "%s",\n  "applicationCommit": "%s",\n  "completedMigrationCount": %s,\n  "sha256": "%s"\n}\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  "$database_name" \
  "$postgres_version" \
  "$application_commit" \
  "$migration_count" \
  "$backup_hash" >"$backup_file.metadata.json"

printf '%s\n' "$backup_file"
