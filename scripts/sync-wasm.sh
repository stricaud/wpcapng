#!/usr/bin/env bash
#
# Build the libpcapng JS/WASM bindings and copy the artifact into this app.
#
# Source of the libpcapng checkout, in priority order:
#   1. $LIBPCAPNG_DIR         (explicit override)
#   2. ./libpcapng            (git submodule — used in CI)
#   3. ../libpcapng           (sibling checkout — convenient for local dev)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "${LIBPCAPNG_DIR:-}" ]; then
  SRC="$LIBPCAPNG_DIR"
elif [ -d "$HERE/libpcapng/bindings/js" ]; then
  SRC="$HERE/libpcapng"
elif [ -d "$HERE/../libpcapng/bindings/js" ]; then
  SRC="$(cd "$HERE/../libpcapng" && pwd)"
else
  echo "error: could not find libpcapng. Set LIBPCAPNG_DIR, add the submodule, or place it at ../libpcapng." >&2
  exit 1
fi

echo "using libpcapng at: $SRC"
( cd "$SRC/bindings/js" && ./build.sh )

mkdir -p "$HERE/src/wasm"
cp "$SRC/bindings/js/dist/libpcapng.mjs" "$HERE/src/wasm/libpcapng.mjs"
echo "copied -> src/wasm/libpcapng.mjs"
