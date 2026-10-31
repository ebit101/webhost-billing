#!/usr/bin/env bash

# Derive only byte-for-byte source and LF/CRLF variants of trusted migration SQL.
# No stored migration row or source file is modified by this helper.
backup_migration_checksums() {
  local migration_file=$1 raw_checksum lf_checksum crlf_checksum
  raw_checksum=$(sha256sum -- "$migration_file" | cut -d ' ' -f1)
  lf_checksum=$(sed -z 's/\r\n/\n/g' -- "$migration_file" | sha256sum | cut -d ' ' -f1)
  crlf_checksum=$(sed -z 's/\r\n/\n/g; s/\n/\r\n/g' -- "$migration_file" | sha256sum | cut -d ' ' -f1)
  printf '%s|%s|%s\n' "$raw_checksum" "$lf_checksum" "$crlf_checksum"
}
