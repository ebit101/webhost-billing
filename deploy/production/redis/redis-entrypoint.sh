#!/bin/sh
set -eu

secret_file="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"
if [ ! -r "$secret_file" ]; then
  echo 'Redis password secret is not readable' >&2
  exit 78
fi

redis_password="$(cat "$secret_file")"
case "$redis_password" in
  ''|*[!A-Za-z0-9_-]*)
    echo 'Redis password must contain only letters, digits, underscores, and hyphens' >&2
    exit 78
    ;;
esac
if [ "${#redis_password}" -lt 48 ]; then
  echo 'Redis password must be at least 48 characters' >&2
  exit 78
fi

umask 077
sed "s|@@REDIS_PASSWORD@@|$redis_password|" \
  /usr/local/etc/redis/redis.conf.template \
  > /tmp/redis.conf
unset redis_password

exec redis-server /tmp/redis.conf
