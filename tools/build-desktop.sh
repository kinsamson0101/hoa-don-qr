#!/usr/bin/env bash
# Build the desktop version for Windows, macOS and Linux into dist/.
# Usage: tools/build-desktop.sh [version]   (needs Go 1.27+ on PATH)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:-$(git describe --tags --always 2>/dev/null || echo dev)}"
export GOFLAGS=-mod=mod CGO_ENABLED=0   # vendor/ holds the web page's JS, not Go modules
go test ./...
rm -rf dist && mkdir -p dist
for target in windows/amd64 windows/arm64 darwin/arm64 darwin/amd64 linux/amd64; do
  os="${target%/*}"; arch="${target#*/}"
  out="dist/hoa-don-qr-${os}-${arch}"; [ "$os" = windows ] && out="$out.exe"
  GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$out" ./cmd/hoa-don-qr
done
(cd dist && sha256sum * > SHA256SUMS.txt)
ls -l dist
