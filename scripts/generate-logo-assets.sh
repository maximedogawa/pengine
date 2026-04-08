#!/usr/bin/env bash
# Regenerate all logo derivatives from the single source file.
# Requires: macOS sips (or adapt for ImageMagick). Tauri CLI via bun/npm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SRC="${1:-src/assets/pengine-logo.png}"
if [[ ! -f "$SRC" ]]; then
  echo "Missing source image: $SRC" >&2
  exit 1
fi

mkdir -p public

resize_png() {
  local size=$1
  local out=$2
  if command -v sips >/dev/null 2>&1; then
    sips -z "$size" "$size" "$SRC" --out "$out" >/dev/null
  elif command -v magick >/dev/null 2>&1; then
    magick "$SRC" -resize "${size}x${size}" "$out"
  else
    echo "Need macOS sips or ImageMagick (magick) to build public/*.png" >&2
    exit 1
  fi
}

echo "Generating web assets (public/) from $SRC ..."
resize_png 32 public/favicon-32.png
resize_png 64 public/pengine-logo-64.png
resize_png 128 public/pengine-logo-128.png

echo "Generating Tauri bundle icons from $SRC ..."
bunx tauri icon "$SRC"

echo "Done."
