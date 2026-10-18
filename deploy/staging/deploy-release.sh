#!/usr/bin/env bash
# Invoked by scripts/deploy-staging.ps1 after GitHub validation and archive upload.
set -euo pipefail

[[ $# -eq 2 && $1 =~ ^[0-9a-f]{40}$ && $2 =~ ^[0-9a-f]{64}$ ]] || {
  echo 'Expected a commit SHA and archive SHA-256.' >&2
  exit 1
}
sha=$1
archive_sha=$2
base=/srv/webhost-billing-staging
release="$base/releases/$sha"
archive="$base/incoming/webhost-staging-$sha.tar.gz"
env_file="$base/.env.staging"
[[ $(id -u) -eq 0 && -L "$base/current" && -f "$env_file" ]] || {
  echo 'Expected the existing root-owned staging installation.' >&2
  exit 1
}
[[ $(stat -c '%a' "$env_file") == 600 ]] || {
  echo 'Staging environment file must have mode 0600.' >&2
  exit 1
}
grep -qx 'RESELLBIZ_LIVE_ENABLED=false' "$env_file" || {
  echo 'Live registrar mode must be disabled.' >&2
  exit 1
}
[[ $(grep -c '^IMAGE_TAG=' "$env_file") -eq 1 ]] || {
  echo 'Missing IMAGE_TAG in staging environment.' >&2
  exit 1
}
echo "$archive_sha  $archive" | sha256sum --check --status
old=$(readlink -f "$base/current")
[[ $old == "$base"/releases/* ]] || { echo 'Unexpected current release.' >&2; exit 1; }
[[ $old != "$release" ]] || { echo 'This release is already current.' >&2; exit 1; }
[[ $(sed -n 's/^IMAGE_TAG=//p' "$env_file") == "$(basename "$old")" ]] || {
  echo 'The active image tag and release directory disagree.' >&2
  exit 1
}
# This installation-owned logo is intentionally excluded from the public Git archive.
logo=apps/web/public/branding/speed-host-logo.png
# Compose accepts the existing quoted value as well as the unquoted form.
grep -Eq '^NEXT_PUBLIC_BRAND_LOGO_PATH=(/branding/speed-host-logo\.png|"/branding/speed-host-logo\.png")$' "$env_file" || {
  echo 'The staging logo setting differs from the expected installation asset.' >&2
  exit 1
}
[[ -f "$old/$logo" && ! -L "$old/$logo" ]] || {
  echo 'The current staging release does not contain its branding asset.' >&2
  exit 1
}
if [[ -e $release ]]; then
  [[ -f "$release/.staging-archive-sha256" ]] &&
    [[ $(cat "$release/.staging-archive-sha256") == "$archive_sha" ]] || {
      echo 'Existing release does not match uploaded archive.' >&2
      exit 1
    }
else
  mkdir -m 700 "$release"
  tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
  printf '%s\n' "$archive_sha" >"$release/.staging-archive-sha256"
fi
[[ -f "$release/deploy/staging/deploy-release.sh" ]] || { echo 'Release script missing.' >&2; exit 1; }
install -D -m 644 "$old/$logo" "$release/$logo"
cmp -s "$old/$logo" "$release/$logo" || { echo 'Branding asset copy failed.' >&2; exit 1; }

export IMAGE_TAG="$sha" COMPOSE_PARALLEL_LIMIT=1
compose() {
  docker compose --env-file "$env_file" \
    -f deploy/production/compose.production.yaml \
    -f deploy/staging/compose.staging.yaml "$@"
}
cd "$release"
compose config --quiet </dev/null
compose ps --format json </dev/null | jq -es '
  length == 7 and all(.[]; .State == "running" and .Health == "healthy")
' >/dev/null || { echo 'Staging preflight services are not all healthy.' >&2; exit 1; }
for service in migrate api web worker; do
  echo "Building $service for $sha"
  compose --profile tools build "$service" </dev/null
done

rollback="$base/rollback/release-$(date -u +%Y%m%dT%H%M%SZ)-$sha"
umask 077
mkdir -m 700 "$rollback"
printf '%s\n' "$old" >"$rollback/previous-release"
cp -p "$env_file" "$rollback/previous-env"
compose ps --format json </dev/null >"$rollback/preflight-services.json"
(
  cd "$old"
  export COMPOSE_FILE="$PWD/deploy/production/compose.production.yaml:$PWD/deploy/staging/compose.staging.yaml"
  export COMPOSE_ENV_FILES="$env_file"
  export BACKUP_DATABASE_NAME=webhost_billing_staging
  backup=$(bash scripts/backups/create-postgres-backup.sh "$base/backups" "$base/secrets/backup_passphrase" </dev/null | tail -n 1)
  bash scripts/backups/verify-postgres-backup.sh "$backup" "$base/secrets/backup_passphrase" </dev/null
  printf '%s\n' "$backup" >"$rollback/verified-backup"
)
echo "Verified backup and rollback inventory: $rollback"

restart_previous() {
  cp -p "$rollback/previous-env" "$env_file"
  cd "$old"
  unset IMAGE_TAG
  compose up -d --no-deps api worker scheduler </dev/null || true
}
recover_before_switch() {
  echo 'Deployment stopped before release switch; restoring the previous app services.' >&2
  restart_previous
}
# Only application writers stop; PostgreSQL, Redis, Mailpit and unrelated stacks remain running.
trap recover_before_switch ERR
compose stop api worker scheduler </dev/null
if ! compose --profile tools run --rm --no-deps migrate </dev/null; then
  recover_before_switch
  exit 1
fi
unfinished=$(compose exec -T postgres sh -ceu '
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --no-align --tuples-only --set ON_ERROR_STOP=1 \
    --command "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL"
' </dev/null | tr -d '\r\n')
if [[ $unfinished != 0 ]]; then
  echo "Database has $unfinished unfinished migrations." >&2
  recover_before_switch
  exit 1
fi

next_env=$(mktemp "$base/.env.staging.XXXXXXXX")
sed "s/^IMAGE_TAG=.*/IMAGE_TAG=$sha/" "$env_file" >"$next_env"
chmod 600 "$next_env"
mv -f "$next_env" "$env_file"
next_link="$base/.current-$sha"
ln -s "$release" "$next_link"
mv -Tf "$next_link" "$base/current"
trap - ERR
cd "$base/current"
compose up -d --no-deps --force-recreate --wait api web worker scheduler </dev/null
compose ps --format json </dev/null >"$rollback/postflight-services.json"
jq -es 'length == 7 and all(.[]; .State == "running" and .Health == "healthy")' \
  "$rollback/postflight-services.json" >/dev/null || {
    echo 'Staging postflight services are not all healthy.' >&2
    exit 1
  }
for service in postgres redis mailpit; do
  before=$(jq -r --arg service "$service" 'select(.Service == $service) | .ID' "$rollback/preflight-services.json")
  after=$(jq -r --arg service "$service" 'select(.Service == $service) | .ID' "$rollback/postflight-services.json")
  [[ -n $before && $before == "$after" ]] || {
    echo "$service was replaced unexpectedly." >&2
    exit 1
  }
done

for path in / /shared-hosting /health /ready; do
  curl --fail --silent --show-error --retry 5 --retry-delay 2 \
    --resolve my.speedhost.bd:443:127.0.0.1 \
    "https://my.speedhost.bd$path" >/dev/null
done
node deploy/staging/verify-web-origin.cjs https://my.speedhost.bd https://my.speedhost.bd
for service in api worker scheduler; do
  [[ $(compose exec -T "$service" printenv RESELLBIZ_LIVE_ENABLED </dev/null) == false ]] || {
    echo "Live registrar flag unexpectedly enabled in $service." >&2
    exit 1
  }
done
echo "Staging deployment healthy: $sha"
echo "Rollback inventory: $rollback"
