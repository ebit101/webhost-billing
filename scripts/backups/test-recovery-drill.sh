#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$script_directory/common.sh"

[[ ${COMMAND28_RECOVERY_DRILL_CONFIRMATION:-} == 'RESET_COMMAND28_FICTIONAL_DATABASES' ]] ||
  backup_die "Set COMMAND28_RECOVERY_DRILL_CONFIRMATION=RESET_COMMAND28_FICTIONAL_DATABASES."

backup_require_command node
backup_require_command pnpm
backup_require_command openssl
backup_require_command truncate
backup_require_runtime

source_database='webhost_billing_backup_source_command28'
restored_database='webhost_billing_restore_command28'
drill_directory=$(mktemp -d)
passphrase_file="$drill_directory/passphrase"
backup_directory="$drill_directory/encrypted"

cleanup() {
  backup_drop_isolated_database "$restored_database" || true
  backup_drop_isolated_database "$source_database" || true
  rm -rf -- "$drill_directory"
}
trap cleanup EXIT

backup_drop_isolated_database "$restored_database"
backup_drop_isolated_database "$source_database"
backup_compose exec -T \
  -e RECOVERY_TARGET_DATABASE="$source_database" \
  "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu '
    createdb --username "$POSTGRES_USER" --template template0 --encoding UTF8 "$RECOVERY_TARGET_DATABASE"
  '

database_url_for() {
  local database_name=$1
  RECOVERY_DATABASE_NAME="$database_name" node -e '
    process.loadEnvFile(".env");
    const value = process.env.DATABASE_URL;
    if (!value) throw new Error("DATABASE_URL is required");
    const url = new URL(value);
    url.pathname = `/${process.env.RECOVERY_DATABASE_NAME}`;
    process.stdout.write(url.toString());
  '
}

source_database_url=$(database_url_for "$source_database")
restored_database_url=$(database_url_for "$restored_database")

(
  cd -- "$BACKUP_REPOSITORY_ROOT"
  DATABASE_URL="$source_database_url" pnpm db:migrate:deploy
  DATABASE_URL="$source_database_url" pnpm db:seed
  DATABASE_URL="$source_database_url" pnpm db:verify
)

umask 077
openssl rand -base64 48 >"$passphrase_file"
mkdir -p -- "$backup_directory"
backup_file=$(
  BACKUP_DATABASE_NAME="$source_database" \
    "$script_directory/create-postgres-backup.sh" "$backup_directory" "$passphrase_file"
)
"$script_directory/verify-postgres-backup.sh" "$backup_file" "$passphrase_file"

tampered_backup="$drill_directory/tampered.dump.gpg"
cp -- "$backup_file" "$tampered_backup"
truncate --size=-1 "$tampered_backup"
tampered_hash=$(sha256sum -- "$tampered_backup" | cut -d ' ' -f1)
printf '%s  %s\n' "$tampered_hash" "$(basename -- "$tampered_backup")" >"$tampered_backup.sha256"
if "$script_directory/verify-postgres-backup.sh" \
  "$tampered_backup" \
  "$passphrase_file" >/dev/null 2>&1; then
  backup_die "Integrity verification accepted a deliberately corrupted encrypted backup."
fi
printf 'Deliberately corrupted encrypted backup was rejected.\n'

RECOVERY_CONFIRMATION="RESTORE_TO_${restored_database}" \
  "$script_directory/restore-postgres-backup.sh" \
  "$backup_file" \
  "$passphrase_file" \
  "$restored_database"

"$script_directory/compare-postgres-databases.sh" \
  "$source_database" \
  "$restored_database"

(
  cd -- "$BACKUP_REPOSITORY_ROOT"
  DATABASE_URL="$restored_database_url" pnpm db:migrate:deploy
  DATABASE_URL="$restored_database_url" pnpm db:migrate:status
  DATABASE_URL="$restored_database_url" pnpm db:verify
)

printf 'Command 28 recovery drill passed using fictional data; temporary databases, key, and backup will now be removed.\n'
