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
backup_require_command gpgconf
backup_require_runtime

source_database='webhost_billing_backup_source_command28'
restored_database='webhost_billing_restore_command28'
drill_parent=$(cd -- "${TMPDIR:-/tmp}" && pwd -P)
drill_directory=$(mktemp -d "$drill_parent/webhost-billing-recovery.XXXXXXXXXX")
passphrase_file="$drill_directory/passphrase"
backup_directory="$drill_directory/encrypted"

cleanup() {
  backup_drop_isolated_database "$restored_database" || true
  backup_drop_isolated_database "$source_database" || true
  [[ $(cd -- "$drill_directory" && pwd -P) == "$drill_directory" &&
    $(dirname -- "$drill_directory") == "$drill_parent" &&
    $(basename -- "$drill_directory") == webhost-billing-recovery.* ]] ||
    backup_die "Unexpected recovery drill cleanup path; retained for inspection."
  GNUPGHOME="$drill_directory/gnupg" gpgconf --kill gpg-agent >/dev/null 2>&1 || true
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
export GNUPGHOME="$drill_directory/gnupg"
mkdir -m 0700 -- "$GNUPGHOME"
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

# Genuine encrypted archives that omit newer application data must fail before
# restore creates a database. Checksums alone cannot establish completeness.
for missing_table in notification_entries existing_domain_orders; do
  incomplete_backup="$drill_directory/missing-${missing_table}.dump.gpg"
  backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$source_database" \
    -e RECOVERY_EXCLUDED_TABLE="$missing_table" "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu 'exec pg_dump --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --format custom --no-owner --no-privileges --exclude-table="public.$RECOVERY_EXCLUDED_TABLE"' |
    backup_gpg_encrypt "$passphrase_file" "$incomplete_backup"
  printf '%s  %s\n' "$(sha256sum -- "$incomplete_backup" | cut -d ' ' -f1)" "$(basename -- "$incomplete_backup")" >"$incomplete_backup.sha256"
  if "$script_directory/verify-postgres-backup.sh" "$incomplete_backup" "$passphrase_file" >/dev/null 2>&1; then
    backup_die "Recovery accepted an archive missing '$missing_table'."
  fi
  printf 'Genuine encrypted archive missing %s was rejected.\n' "$missing_table"
done

if RECOVERY_CONFIRMATION="RESTORE_TO_${source_database}" \
  "$script_directory/restore-postgres-backup.sh" "$backup_file" "$passphrase_file" "$source_database" >/dev/null 2>&1; then
  backup_die "Restore accepted a source database instead of an isolated recovery target."
fi
if RECOVERY_CONFIRMATION="RESTORE_TO_${restored_database}" \
  "$script_directory/restore-postgres-backup.sh" "$backup_file" "$passphrase_file" "$restored_database" >/dev/null 2>&1; then
  backup_die "Restore replaced an existing recovery database."
fi
printf 'Source-target and existing-target restore guards passed.\n'

backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$restored_database" "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --set ON_ERROR_STOP=1' <<'SQL'
UPDATE settings SET description = coalesce(description, '') || ' fictional recovery alteration'
WHERE key = (SELECT key FROM settings ORDER BY key LIMIT 1);
SQL
if "$script_directory/compare-postgres-databases.sh" "$source_database" "$restored_database" >/dev/null 2>&1; then
  backup_die "Comparison accepted different row content with matching counts."
fi
printf 'Equal-count row-content alteration was rejected.\n'

first_migration_file=$(find "$BACKUP_REPOSITORY_ROOT/packages/database/prisma/migrations" -mindepth 2 -maxdepth 2 -type f -name migration.sql -print | LC_ALL=C sort | sed -n '1p')
IFS='|' read -r raw_checksum lf_checksum crlf_checksum < <(backup_migration_checksums "$first_migration_file")
alternate_checksum=$lf_checksum
[[ "$alternate_checksum" != "$raw_checksum" ]] || alternate_checksum=$crlf_checksum
[[ "$alternate_checksum" =~ ^[0-9a-f]{64}$ && "$alternate_checksum" != "$raw_checksum" ]] || backup_die "The fictional line-ending fixture must have distinct checksums."
backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$restored_database" \
  -e RECOVERY_ALTERNATE_CHECKSUM="$alternate_checksum" "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --set ON_ERROR_STOP=1 --set alternate_checksum="$RECOVERY_ALTERNATE_CHECKSUM"' <<'SQL'
UPDATE _prisma_migrations SET checksum = :'alternate_checksum'
WHERE migration_name = (SELECT migration_name FROM _prisma_migrations ORDER BY migration_name LIMIT 1);
SQL
"$script_directory/verify-restored-database.sh" "$restored_database"
printf 'Trusted migration LF/CRLF checksum variant was accepted without changing source SQL.\n'

backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$restored_database" "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --set ON_ERROR_STOP=1' <<'SQL'
UPDATE _prisma_migrations SET checksum = repeat('0', 64)
WHERE migration_name = (SELECT migration_name FROM _prisma_migrations ORDER BY migration_name LIMIT 1);
SQL
if "$script_directory/verify-restored-database.sh" "$restored_database" >/dev/null 2>&1; then
  backup_die "Verification accepted a changed migration checksum."
fi
printf 'Changed release migration checksum was rejected.\n'

original_checksum=$(backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$source_database" "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --no-align --tuples-only --set ON_ERROR_STOP=1' <<'SQL'
SELECT checksum FROM _prisma_migrations ORDER BY migration_name LIMIT 1;
SQL
)
[[ "$original_checksum" =~ ^[0-9a-f]{64}$ ]] || backup_die "Unexpected fictional source migration checksum."
backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$restored_database" \
  -e RECOVERY_EXPECTED_CHECKSUM="$original_checksum" "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --set ON_ERROR_STOP=1 --set expected_checksum="$RECOVERY_EXPECTED_CHECKSUM"' <<'SQL'
UPDATE _prisma_migrations SET checksum = :'expected_checksum', finished_at = NULL
WHERE migration_name = (SELECT migration_name FROM _prisma_migrations ORDER BY migration_name LIMIT 1);
SQL
if "$script_directory/verify-restored-database.sh" "$restored_database" >/dev/null 2>&1; then
  backup_die "Verification accepted unfinished migration history."
fi
printf 'Unfinished release migration was rejected.\n'

# Only the deliberately altered, fixed-name fictional target is recreated.
backup_drop_isolated_database "$restored_database"
RECOVERY_CONFIRMATION="RESTORE_TO_${restored_database}" \
  "$script_directory/restore-postgres-backup.sh" "$backup_file" "$passphrase_file" "$restored_database"
"$script_directory/compare-postgres-databases.sh" "$source_database" "$restored_database"

(
  cd -- "$BACKUP_REPOSITORY_ROOT"
  DATABASE_URL="$restored_database_url" pnpm db:migrate:deploy
  DATABASE_URL="$restored_database_url" pnpm db:migrate:status
  DATABASE_URL="$restored_database_url" pnpm db:verify
)

printf 'Command 28 recovery drill passed using fictional data; temporary databases, key, and backup will now be removed.\n'
