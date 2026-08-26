#!/usr/bin/env bash

set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
source "$script_directory/common.sh"

[[ $# -eq 2 ]] || backup_die "Usage: $0 ENCRYPTED_BACKUP PASSPHRASE_FILE"

backup_file=$1
passphrase_file=$2

[[ -f "$backup_file" && ! -L "$backup_file" ]] ||
  backup_die "The encrypted backup must be a regular file."
backup_require_passphrase_file "$passphrase_file"
backup_require_runtime

checksum_file="$backup_file.sha256"
[[ -f "$checksum_file" && ! -L "$checksum_file" ]] ||
  backup_die "The companion SHA-256 file is missing."
(
  cd -- "$(dirname -- "$backup_file")"
  sha256sum --check --status "$(basename -- "$checksum_file")"
) || backup_die "The encrypted backup checksum does not match."

backup_verify_archive_contents "$backup_file" "$passphrase_file"
printf 'Verified encrypted checksum, OpenPGP integrity, PostgreSQL archive structure, and required tables.\n'
