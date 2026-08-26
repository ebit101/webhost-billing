#!/usr/bin/env bash

set -euo pipefail

BACKUP_SCRIPT_DIRECTORY=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BACKUP_REPOSITORY_ROOT=$(cd -- "$BACKUP_SCRIPT_DIRECTORY/../.." && pwd)
BACKUP_POSTGRES_SERVICE=${BACKUP_POSTGRES_SERVICE:-postgres}
BACKUP_REQUIRED_TABLES=(
  _prisma_migrations users customers admin_profiles products product_prices
  orders order_items services servers invoices invoice_items payments payment_events
  tickets ticket_messages email_logs email_attempts activity_logs automation_runs
  settings outbox_events hosting_panel_operations integration_credentials auth_sessions
  password_reset_tokens email_verification_tokens admin_totp_credentials
  admin_recovery_codes admin_login_challenges
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
