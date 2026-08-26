#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$script_directory/common.sh"

[[ $# -eq 2 ]] || backup_die "Usage: $0 SOURCE_DATABASE ISOLATED_RESTORED_DATABASE"
source_database=$1
restored_database=$2

backup_validate_database_name "$source_database"
backup_validate_recovery_database_name "$restored_database"
backup_require_runtime
backup_database_exists "$source_database" || backup_die "The source database does not exist."
backup_database_exists "$restored_database" || backup_die "The restored database does not exist."

comparison_directory=$(mktemp -d)
cleanup() {
  rm -rf -- "$comparison_directory"
}
trap cleanup EXIT

tables=("${BACKUP_REQUIRED_TABLES[@]}")

capture_counts() {
  local database_name=$1
  local output_file=$2
  local table_name
  for table_name in "${tables[@]}"; do
    local count
    count=$(
      backup_compose exec -T \
        -e RECOVERY_TARGET_DATABASE="$database_name" \
        -e RECOVERY_TABLE_NAME="$table_name" \
        "$BACKUP_POSTGRES_SERVICE" \
        sh -ceu '
          psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" \
            --no-align --tuples-only --set ON_ERROR_STOP=1 \
            --command "SELECT COUNT(*) FROM public.\"$RECOVERY_TABLE_NAME\""
        '
    )
    printf '%s|%s\n' "$table_name" "$count" >>"$output_file"
  done
}

capture_counts "$source_database" "$comparison_directory/source-counts"
capture_counts "$restored_database" "$comparison_directory/restored-counts"

diff --unified=0 \
  "$comparison_directory/source-counts" \
  "$comparison_directory/restored-counts" >/dev/null ||
  backup_die "Source and restored row counts differ."

source_migrations="$comparison_directory/source-migrations"
restored_migrations="$comparison_directory/restored-migrations"
for database_name in "$source_database" "$restored_database"; do
  output_file=$source_migrations
  [[ "$database_name" == "$restored_database" ]] && output_file=$restored_migrations
  backup_compose exec -T \
    -e RECOVERY_TARGET_DATABASE="$database_name" \
    "$BACKUP_POSTGRES_SERVICE" \
    sh -ceu '
      psql --username "$POSTGRES_USER" --dbname "$RECOVERY_TARGET_DATABASE" \
        --no-align --tuples-only --set ON_ERROR_STOP=1 \
        --command "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
    ' >"$output_file"
done
cmp --silent "$source_migrations" "$restored_migrations" ||
  backup_die "Source and restored migration histories differ."

"$script_directory/verify-restored-database.sh" "$restored_database"
printf 'Compared %s table counts and complete migration history; source and restored databases match.\n' "${#tables[@]}"
