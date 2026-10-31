#!/usr/bin/env bash

set -euo pipefail

BACKUP_SCRIPT_DIRECTORY=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BACKUP_REPOSITORY_ROOT=$(cd -- "$BACKUP_SCRIPT_DIRECTORY/../.." && pwd)
BACKUP_POSTGRES_SERVICE=${BACKUP_POSTGRES_SERVICE:-postgres}
source "$BACKUP_SCRIPT_DIRECTORY/migration-checksums.sh"
BACKUP_REQUIRED_TABLES=(
  _prisma_migrations
  activity_logs
  admin_login_challenges
  admin_profiles
  admin_recovery_codes
  admin_totp_credentials
  auth_sessions
  automation_runs
  currency_authorization_evidence
  currency_controls
  currency_execution_domains
  currency_installations
  currency_policy_revisions
  currency_selection_intents
  currency_unit_definitions
  customers
  domain_actions
  domain_catalogue_tlds
  domain_offers
  domain_quotes
  domains
  email_attempts
  email_logs
  email_verification_tokens
  existing_domain_orders
  fake_registrar_registrations
  hosting_panel_operations
  integration_credentials
  invoice_items
  invoices
  notification_entries
  notification_epochs
  notification_preferences
  notification_sources
  order_items
  orders
  outbox_events
  password_reset_tokens
  payment_events
  payments
  product_groups
  product_prices
  products
  registrar_accounts
  registrar_credentials
  registrar_evidence
  registrar_mappings
  registrar_operations
  registrar_preparations
  registrar_profiles
  servers
  services
  settings
  ticket_messages
  tickets
  users
)

backup_die() {
  printf 'Backup operation refused: %s\n' "$1" >&2
  exit 1
}

backup_require_command() {
  command -v "$1" >/dev/null 2>&1 || backup_die "Required command '$1' is unavailable."
}

backup_validate_database_name() {
  local database_name=$1
  [[ "$database_name" =~ ^[a-z][a-z0-9_]{0,62}$ ]] ||
    backup_die "Database names must be 1-63 lowercase letters, digits, or underscores."
}

backup_validate_recovery_database_name() {
  local database_name=$1
  backup_validate_database_name "$database_name"
  [[ "$database_name" =~ ^webhost_billing_restore_[a-z0-9_]+$ ]] ||
    backup_die "Restore targets must start with 'webhost_billing_restore_'."
}

backup_require_passphrase_file() {
  local passphrase_file=$1
  [[ -f "$passphrase_file" ]] || backup_die "The passphrase file does not exist."
  [[ ! -L "$passphrase_file" ]] || backup_die "The passphrase file must not be a symbolic link."
  local permissions
  permissions=$(stat -c '%a' -- "$passphrase_file")
  [[ "$permissions" == '400' || "$permissions" == '600' ]] ||
    backup_die "The passphrase file must have mode 0400 or 0600."
  local size
  size=$(wc -c <"$passphrase_file")
  ((size >= 32)) || backup_die "The backup passphrase must contain at least 32 bytes."
}

backup_compose() {
  docker compose --project-directory "$BACKUP_REPOSITORY_ROOT" "$@"
}

backup_require_runtime() {
  backup_require_command docker
  backup_require_command gpg
  backup_require_command sha256sum
  backup_compose ps --status running "$BACKUP_POSTGRES_SERVICE" --quiet |
    grep -q . || backup_die "The configured PostgreSQL Compose service is not running."
}

backup_gpg_encrypt() {
  local passphrase_file=$1
  local output_file=$2
  gpg \
    --batch \
    --yes \
    --no-options \
    --no-symkey-cache \
    --pinentry-mode loopback \
    --passphrase-file "$passphrase_file" \
    --cipher-algo AES256 \
    --force-mdc \
    --s2k-mode 3 \
    --s2k-digest-algo SHA512 \
    --s2k-count 65011712 \
    --compress-algo none \
    --symmetric \
    --output "$output_file"
}

backup_gpg_decrypt() {
  local passphrase_file=$1
  local input_file=$2
  gpg \
    --batch \
    --quiet \
    --no-options \
    --no-symkey-cache \
    --pinentry-mode loopback \
    --passphrase-file "$passphrase_file" \
    --decrypt "$input_file"
}

backup_verify_database_release() (
  local database_name=$1
  backup_validate_database_name "$database_name"
  local verification_directory migrations_directory migration_file migration_name checksum
  verification_directory=$(mktemp -d)
  trap 'rm -f -- "$verification_directory/expected-tables" "$verification_directory/actual-tables" "$verification_directory/expected-migrations" "$verification_directory/actual-migrations"; rmdir -- "$verification_directory"' EXIT
  migrations_directory="$BACKUP_REPOSITORY_ROOT/packages/database/prisma/migrations"
  [[ -d "$migrations_directory" ]] || backup_die "The matching release migration sources are required."

  printf '%s\n' "${BACKUP_REQUIRED_TABLES[@]}" | LC_ALL=C sort >"$verification_directory/expected-tables"
  backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$database_name" "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --no-align --tuples-only --set ON_ERROR_STOP=1' \
    >"$verification_directory/actual-tables" <<'SQL'
BEGIN READ ONLY;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename COLLATE "C";
COMMIT;
SQL
  cmp --silent "$verification_directory/expected-tables" "$verification_directory/actual-tables" ||
    backup_die "Database tables do not match this release; use the matching recovery source."

  while IFS= read -r migration_file; do
    migration_name=$(basename -- "$(dirname -- "$migration_file")")
    [[ "$migration_name" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] || backup_die "Unexpected migration source name."
    checksum=$(backup_migration_checksums "$migration_file")
    printf '%s|%s\n' "$migration_name" "$checksum" >>"$verification_directory/expected-migrations"
  done < <(find "$migrations_directory" -mindepth 2 -maxdepth 2 -type f -name migration.sql -print | LC_ALL=C sort)
  [[ -s "$verification_directory/expected-migrations" ]] || backup_die "No matching release migrations were found."

  backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$database_name" "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --no-align --tuples-only --set ON_ERROR_STOP=1' \
    >"$verification_directory/actual-migrations" <<'SQL'
BEGIN READ ONLY;
SELECT migration_name || '|' || checksum FROM _prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name COLLATE "C";
SELECT 'unfinished migration' FROM _prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL;
COMMIT;
SQL
  # Prisma accepts LF/CRLF variants of the same trusted SQL. Do not rewrite
  # historical metadata or accept any checksum outside these computed variants.
  LC_ALL=C awk -F '|' '
    NR == FNR { allowed[$1] = "|" $2 "|" $3 "|" $4 "|"; next }
    { if (NF != 2 || !($1 in allowed) || seen[$1]++ || length($2) != 64 || $2 ~ /[^0-9a-f]/ || !index(allowed[$1], "|" $2 "|")) bad = 1 }
    END { for (name in allowed) if (seen[name] != 1) bad = 1; exit bad }
  ' "$verification_directory/expected-migrations" "$verification_directory/actual-migrations" ||
    backup_die "Migration names/checksums or unfinished state do not match this release."
)

backup_capture_database_fingerprint() {
  local database_name=$1
  backup_validate_database_name "$database_name"
  # One read-only repeatable-read snapshot. Only row hashes leave PostgreSQL;
  # sorting preserves duplicate rows without writing customer content to disk.
  {
    printf '%s\n' 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;' "SET LOCAL TIME ZONE 'UTC';"
    local table_name
    for table_name in "${BACKUP_REQUIRED_TABLES[@]}"; do
      printf "SELECT 'table|%s';\n" "$table_name"
      printf "SELECT 'row|%s|' || encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') FROM public.\"%s\" AS t;\n" "$table_name" "$table_name"
    done
    printf '%s\n' 'COMMIT;'
  } | backup_compose exec -T -e RECOVERY_TARGET_DATABASE="$database_name" "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu 'exec psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" --quiet --no-align --tuples-only --set ON_ERROR_STOP=1' |
    LC_ALL=C sort | sha256sum | cut -d ' ' -f1
}

backup_verify_archive_contents() {
  local backup_file=$1
  local passphrase_file=$2
  local list_file
  list_file=$(mktemp)
  trap 'rm -f -- "$list_file"' RETURN

  backup_gpg_decrypt "$passphrase_file" "$backup_file" |
    backup_compose exec -T "$BACKUP_POSTGRES_SERVICE" pg_restore --list >"$list_file"

  local required_table
  for required_table in "${BACKUP_REQUIRED_TABLES[@]}"; do
    grep -Eq "TABLE DATA public ${required_table}( |$)" "$list_file" ||
      backup_die "The decrypted archive is missing required table data for '$required_table'."
  done
}

backup_database_exists() {
  local database_name=$1
  backup_compose exec -T \
    -e RECOVERY_TARGET_DATABASE="$database_name" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      psql --username "$POSTGRES_USER" --dbname postgres --tuples-only --no-align \
        --command "SELECT 1 FROM pg_database WHERE datname = '\''$RECOVERY_TARGET_DATABASE'\''"
    ' | grep -q '^1$'
}

backup_drop_isolated_database() {
  local database_name=$1
  backup_validate_database_name "$database_name"
  [[ "$database_name" == 'webhost_billing_backup_source_command28' ||
    "$database_name" == 'webhost_billing_restore_command28' ]] ||
    backup_die "Automated cleanup is limited to the two fixed Command 28 fictional databases."
  backup_compose exec -T \
    -e RECOVERY_TARGET_DATABASE="$database_name" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      dropdb --if-exists --force --username "$POSTGRES_USER" "$RECOVERY_TARGET_DATABASE"
    '
}
