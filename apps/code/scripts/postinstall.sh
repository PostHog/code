#!/bin/bash

# Postinstall script for the Electron app
# Rebuilds native modules against Electron's Node headers and applies patches

set -e

REPO_ROOT="$(cd ../.. && pwd)"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Rebuilding native modules for Electron..."

cd "$REPO_ROOT"
npx @electron/rebuild -f -m node_modules/node-pty
npx @electron/rebuild -f -m node_modules/better-sqlite3 || true

echo "Patching Electron app name..."
bash "$SCRIPTS_DIR/patch-electron-name.sh"

echo "Downloading binaries..."
node "$SCRIPTS_DIR/download-binaries.mjs"

echo "Postinstall complete."
