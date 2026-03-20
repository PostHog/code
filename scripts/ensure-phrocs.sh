#!/usr/bin/env bash
set -euo pipefail

PHROCS_BIN="bin/phrocs"

if [ -x "$PHROCS_BIN" ]; then
  exit 0
fi

echo "phrocs not found, downloading..."

ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64)        ARCH="amd64" ;;
  *)             echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

case "$OS" in
  darwin|linux) ;;
  *)            echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

BINARY="phrocs-${OS}-${ARCH}"
URL="https://github.com/PostHog/posthog/releases/download/phrocs-latest/${BINARY}"

mkdir -p bin
curl -fSL "$URL" -o "$PHROCS_BIN"
chmod +x "$PHROCS_BIN"

echo "phrocs installed to $PHROCS_BIN"
