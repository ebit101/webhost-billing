#!/bin/sh
set -eu

validate_hostname() {
  name="$1"
  value="$2"
  case "$value" in
    ''|*[!A-Za-z0-9.-]*|.*|*.)
      echo "$name is not a valid DNS hostname" >&2
      exit 78
      ;;
  esac
}

validate_hostname BILLING_HOST "${BILLING_HOST:-}"
validate_hostname API_HOST "${API_HOST:-}"

if [ "$BILLING_HOST" = "$API_HOST" ]; then
  echo "BILLING_HOST and API_HOST must be different" >&2
  exit 78
fi

mkdir -p \
  /tmp/nginx/cache/client_temp \
  /tmp/nginx/cache/proxy_temp \
  /tmp/nginx/cache/fastcgi_temp \
  /tmp/nginx/cache/uwsgi_temp \
  /tmp/nginx/cache/scgi_temp \
  /tmp/nginx/run

envsubst '${BILLING_HOST} ${API_HOST}' \
  < /etc/nginx/nginx.conf.template \
  > /tmp/nginx/nginx.conf

exec nginx -c /tmp/nginx/nginx.conf -g 'daemon off;'
