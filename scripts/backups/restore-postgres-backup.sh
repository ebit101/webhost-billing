#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$script_directory/common.sh"

[[ $# -eq 3 ]] ||
  backup_die "Usage: $0 ENCRYPTED_BACKUP PASSPHRASE_FILE ISOLATED_DATABASE_NAME"

backup_file=$1
passphrase_file=$2
target_database=$3

backup_validate_recovery_database_name "$target_database"
[[ ${RECOVERY_CONFIRMATION:-} == "RESTORE_TO_${target_database}" ]] ||
  backup_die "Set RECOVERY_CONFIRMATION=RESTORE_TO_${target_database} for this exact target."

"$script_directory/verify-postgres-backup.sh" "$backup_file" "$passphrase_file"

if backup_database_exists "$target_database"; then
  backup_die "The isolated recovery database already exists; this script never replaces it."
fi

backup_compose exec -T \
  -e RECOVERY_TARGET_DATABASE="$target_database" \
  "$BACKUP_POSTGRES_SERVICE" \
  sh -ceu '
    createdb \
      --username "$POSTGRES_USER" \
      --template template0 \
      --encoding UTF8 \
      "$RECOVERY_TARGET_DATABASE"
  '

if ! backup_gpg_decrypt "$passphrase_file" "$backup_file" |
  backup_compose exec -T \
    -e RECOVERY_TARGET_DATABASE="$target_database" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      pg_restore \
        --username "$POSTGRES_USER" \
        --dbname "$RECOVERY_TARGET_DATABASE" \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges
    '; then
  backup_compose exec -T \
    -e RECOVERY_TARGET_DATABASE="$target_database" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      dropdb --if-exists --force --username "$POSTGRES_USER" "$RECOVERY_TARGET_DATABASE"
    '
  backup_die "Restore failed; the newly created isolated database was removed."
fi

"$script_directory/verify-restored-database.sh" "$target_database"
printf 'Restored and structurally verified isolated database %s.\n' "$target_database"
