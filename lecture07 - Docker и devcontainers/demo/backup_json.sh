#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "$0")" && pwd)
backup_dir="$project_dir/backups"
mkdir -p "$backup_dir"

stamp=$(date -u +%Y%m%dT%H%M%S.%NZ)
backup="$backup_dir/notes-$stamp.json"
cp -- "$project_dir/bind-data/notes.json" "$backup.tmp"
mv -- "$backup.tmp" "$backup"
printf '%s\n' "$backup"
