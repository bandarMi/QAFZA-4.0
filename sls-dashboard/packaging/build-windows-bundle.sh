#!/usr/bin/env bash
#
# Build the portable Windows bundle: a folder that runs the whole dashboard by
# double-clicking one .exe, with no installer, no Node.js on the machine and no
# administrator rights.
#
# This is buildable from Linux or macOS because nothing in it is compiled per
# platform: the app is pure JavaScript (SQLite comes from inside Node itself),
# the Node runtime is downloaded as an official prebuilt binary, and the launcher
# is cross-compiled with mingw-w64.
#
# Requirements: node 24+, npm, curl, unzip, zip, x86_64-w64-mingw32-gcc
# Usage: packaging/build-windows-bundle.sh [output-dir]

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.21.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/packaging/out}"
STAGE="$OUT/SLS-Dashboard"
CACHE="${NODE_CACHE:-$OUT/.cache}"

echo "==> Building the SLS Dashboard portable Windows bundle"
echo "    Node runtime: v$NODE_VERSION (win-x64)"

rm -rf "$STAGE"
mkdir -p "$STAGE/runtime" "$STAGE/app/server" "$CACHE"

# ---------------------------------------------------------------- node runtime
NODE_ZIP="$CACHE/node-v$NODE_VERSION-win-x64.zip"
if [ ! -f "$NODE_ZIP" ]; then
  echo "==> Downloading the official Node.js Windows build"
  curl -fsSL -o "$NODE_ZIP" "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-win-x64.zip"
fi
echo "==> Extracting node.exe"
rm -rf "$CACHE/node-v$NODE_VERSION-win-x64"
unzip -q -o "$NODE_ZIP" "node-v$NODE_VERSION-win-x64/node.exe" -d "$CACHE"
cp "$CACHE/node-v$NODE_VERSION-win-x64/node.exe" "$STAGE/runtime/node.exe"

# ------------------------------------------------------------------- the app
echo "==> Compiling the server and building the web UI"
( cd "$ROOT" && npm run build >/dev/null )

echo "==> Installing runtime dependencies only (no dev, no native modules)"
DEPS="$OUT/.deps"
rm -rf "$DEPS" && mkdir -p "$DEPS"
node -e "
  const p = require('$ROOT/server/package.json');
  require('fs').writeFileSync('$DEPS/package.json', JSON.stringify({
    name: 'sls-server', private: true, version: p.version, type: 'module',
    dependencies: p.dependencies,
  }, null, 2));
"
( cd "$DEPS" && npm install --omit=dev --no-audit --no-fund --ignore-scripts >/dev/null )

# Anything native would defeat the point of a portable bundle — fail loudly.
if find "$DEPS/node_modules" -name '*.node' | grep -q .; then
  echo "!!! A native module ended up in the runtime dependencies:"
  find "$DEPS/node_modules" -name '*.node'
  exit 1
fi

echo "==> Assembling"
cp -r "$ROOT/server/dist"          "$STAGE/app/server/dist"
cp -r "$DEPS/node_modules"         "$STAGE/app/server/node_modules"
cp    "$ROOT/server/package.json"  "$STAGE/app/server/package.json"
mkdir -p "$STAGE/app/web"
cp -r "$ROOT/web/dist"             "$STAGE/app/web/dist"
cp    "$ROOT/design-tokens.json"   "$STAGE/app/design-tokens.json"
cp -r "$ROOT/assets"               "$STAGE/app/assets"
mkdir -p "$STAGE/docs"
cp    "$ROOT/docs/"*.md            "$STAGE/docs/"
cp    "$ROOT/README.md"            "$STAGE/docs/README.md"

# ---------------------------------------------------------------- the launcher
echo "==> Cross-compiling the launcher"
x86_64-w64-mingw32-gcc -O2 -s -o "$STAGE/SLS Dashboard.exe" "$ROOT/packaging/launcher.c" -lshell32
cp "$ROOT/packaging/START-HERE.txt" "$STAGE/START HERE.txt"

# ---------------------------------------------------------------------- package
echo "==> Zipping"
mkdir -p "$OUT"
rm -f "$OUT/SLS-Dashboard-Windows.zip"
( cd "$OUT" && zip -qr "SLS-Dashboard-Windows.zip" "SLS-Dashboard" )

echo
echo "==> Done"
echo "    Folder: $STAGE"
echo "    Zip:    $OUT/SLS-Dashboard-Windows.zip  ($(du -h "$OUT/SLS-Dashboard-Windows.zip" | cut -f1))"
