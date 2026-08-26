#!/usr/bin/env bash
set -Eeuo pipefail

load_secret() {
  local variable="$1"
  local file_variable="${variable}_FILE"
  local secret_file="${!file_variable:-}"

  if [[ -z "$secret_file" ]]; then
    return
  fi
  if [[ ! -f "$secret_file" || ! -r "$secret_file" ]]; then
    echo "Secret file for ${variable} is not readable" >&2
    exit 78
  fi

  local value
  value="$(<"$secret_file")"
  if [[ -z "$value" ]]; then
    echo "Secret file for ${variable} is empty" >&2
    exit 78
  fi

  printf -v "$variable" '%s' "$value"
  export "$variable"
  unset "$file_variable"
}

for variable in \
  DATABASE_URL \
  REDIS_URL \
  SESSION_SECRET \
  CREDENTIAL_ENCRYPTION_KEY \
  SMTP_USERNAME \
  SMTP_PASSWORD \
  BKASH_APP_KEY \
  BKASH_APP_SECRET \
  BKASH_USERNAME \
  BKASH_PASSWORD \
  SSLCOMMERZ_STORE_ID \
  SSLCOMMERZ_STORE_PASSWORD; do
  load_secret "$variable"
done

exec "$@"
