#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# release.sh — release engineering (M7-WP6, SPEC §8.5, N4/N11).
#
#   bash scripts/release.sh [--dry-run] [VERSION]
#
# Produces dist/release/:
#   panelcraft-<v>-<os>-<arch>[.exe]     6 binaries (CGO off, web/dist embedded)
#   SHA256SUMS                           checksums over all binaries
#   pages/                               GitHub Pages artifact (SPA, offline-capable)
#
# RELEASE_OS="linux darwin" filters the matrix (release.yml per-runner builds).
# Boot-smoke: the native binary must answer `version` (exact stamp) and
# `validate` on docs/architecture; foreign-OS smoke runs in release.yml.
# OFFLINE=1 asserts no network during the build (N11).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-}"
if [[ "${1:-}" == "--dry-run" ]]; then
  VERSION="${2:-0.0.0-dryrun}"
fi
if [[ -z "$VERSION" ]]; then
  echo "usage: release.sh [--dry-run] [VERSION]" >&2
  exit 2
fi
VERSION="${VERSION#v}" # ldflags var holds bare semver

echo "release: version $VERSION"

# ---- prerequisites -----------------------------------------------------------
if [[ ! -f web/dist/index.html ]]; then
  echo "release: web/dist missing — run npm run build first" >&2
  exit 2
fi

if [[ "${OFFLINE:-0}" == "1" ]]; then
  # N11: prove the build runs without network. GOFLAGS=-mod=mod only; the
  # toolchain must resolve everything from module cache. Any fetch fails the run.
  export GOPROXY=off
  export GOFLAGS="-mod=mod"
  echo "release: OFFLINE=1 — GOPROXY=off"
fi

OUT="dist/release"
rm -rf "$OUT"
mkdir -p "$OUT/pages"

LDFLAGS="-s -w -X main.version=$VERSION"

# ---- binary matrix: linux/darwin/windows × amd64/arm64 -----------------------
# RELEASE_OS="linux darwin" filters the matrix (release.yml per-runner builds);
# default = all six. Native pair always builds so boot-smoke can run.
FAIL=0
TARGET_OS="${RELEASE_OS:-linux darwin windows}"
for os_name in linux darwin windows; do
  case " $TARGET_OS " in *" $os_name "*) ;; *) continue ;; esac
  for arch in amd64 arm64; do
    ext=""
    [[ "$os_name" == "windows" ]] && ext=".exe"
    bin="$OUT/panelcraft-$VERSION-$os_name-$arch$ext"
    echo "release: building $bin"
    if ! CGO_ENABLED=0 GOOS="$os_name" GOARCH="$arch" \
      go build -trimpath -ldflags "$LDFLAGS" -o "$bin" ./cmd/panelcraft; then
      echo "release: build failed for $os_name/$arch" >&2
      FAIL=1
    fi
  done
done
(( FAIL == 0 )) || exit 1

# ---- pages artifact -----------------------------------------------------------
cp web/dist/index.html "$OUT/pages/"
cp -R web/dist/assets "$OUT/pages/assets"
# SPA fallback: GitHub Pages serves 404.html for unknown routes
cp web/dist/index.html "$OUT/pages/404.html"

# ---- checksums -----------------------------------------------------------------
( cd "$OUT" && find . -maxdepth 1 -type f -name 'panelcraft-*' -print0 \
  | sort -z | xargs -0 shasum -a 256 > SHA256SUMS )

# ---- boot-smoke (native binary; skipped if RELEASE_OS excluded the host OS,
# full per-OS smoke runs on release.yml runners) --------------------------------
NATIVE_OS="$(go env GOOS)"; NATIVE_ARCH="$(go env GOARCH)"
NATIVE_BIN="$OUT/panelcraft-$VERSION-$NATIVE_OS-$NATIVE_ARCH"
[[ "$NATIVE_OS" == "windows" ]] && NATIVE_BIN="$NATIVE_BIN.exe"
case " $TARGET_OS " in
  *" $NATIVE_OS "*)
    echo "release: boot-smoke $NATIVE_BIN"
    NATIVE_OUT="$("$NATIVE_BIN" version)"
    echo "release: $NATIVE_OUT"
    [[ "$NATIVE_OUT" == *"panelcraft $VERSION ($NATIVE_OS/$NATIVE_ARCH)"* ]] || {
      echo "release: version stamp mismatch: $NATIVE_OUT" >&2
      exit 1
    }
    "$NATIVE_BIN" validate docs/architecture > /dev/null
    ;;
  *)
    echo "release: boot-smoke skipped (host $NATIVE_OS not in RELEASE_OS list)"
    ;;
esac

echo "release: artifacts in $OUT:"
ls -la "$OUT" | sed 's/^/  /'
echo "release: OK"
