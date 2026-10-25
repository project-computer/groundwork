#!/usr/bin/env bash
# Builds the Go sidecar and stages it with the target-triple suffix Tauri
# expects for external binaries.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cd "$root/apps/sidecar"
mkdir -p bin
go build -trimpath -o bin/clinic-core ./cmd/clinic-core

triple="$(rustc -vV | awk '/^host:/{print $2}')"
stage="$root/apps/clinic/src-tauri/binaries"
mkdir -p "$stage"
cp bin/clinic-core "$stage/clinic-core-$triple"

echo "staged $stage/clinic-core-$triple"
