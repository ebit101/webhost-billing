#!/usr/bin/env bash
set -euo pipefail

base=${1:-}
mode=${2:-classify}
if [[ ! $base =~ ^[0-9a-f]{40}$ ]] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  [[ $mode == classify ]] || exit 1
  echo 'docs_only=false'
  exit 0
fi

paths=$(mktemp)
trap 'rm -f "$paths"' EXIT
git diff --no-renames --name-only -z "$base" HEAD -- >"$paths"
docs_only=false
while IFS= read -r -d '' path; do
  case "$path" in
    README.md|docs/*.md) ;;
    docs/assets/*.png|docs/assets/*.jpg|docs/assets/*.jpeg|docs/assets/*.webp)
      if [[ $mode == images && ( -e $path || -L $path ) ]]; then
        expected=image/${path##*.}
        [[ $expected != image/jpg ]] || expected=image/jpeg
        if [[ ! -f $path || -L $path || ! -s $path ]] ||
          [[ $(file --brief --mime-type -- "$path") != "$expected" ]]; then
          printf 'Invalid documentation image: %q\n' "$path" >&2
          exit 1
        fi
      fi
      ;;
    *) echo 'docs_only=false'; exit 0 ;;
  esac
  docs_only=true
done <"$paths"

if [[ $mode == classify ]]; then
  printf 'docs_only=%s\n' "$docs_only"
fi
