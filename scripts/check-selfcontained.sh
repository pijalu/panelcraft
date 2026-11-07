#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# check-selfcontained.sh — SPEC §8.6 asset-origin gate (N7/N11).
# Scans web/dist/** for external-origin resource loads:
#   <script|img|source|track|iframe> src, <link|use> href, CSS url()/@import,
#   dynamic import() targets.
# Any origin != self  =>  build fails (exit 1) with the offending lines listed.
# `https://` inside string literals/labels is fine — only resource loads are scanned.
#
# Usage: scripts/check-selfcontained.sh [dist-dir]   (default: web/dist)
set -euo pipefail

DIST="${1:-web/dist}"

if [[ ! -d "$DIST" ]]; then
  echo "check-selfcontained: $DIST not found — run 'npm run build' first" >&2
  exit 1
fi

violations=0
fail() {
  echo "check-selfcontained: EXTERNAL resource load → $1" >&2
  violations=$((violations + 1))
}

# External origin = absolute http(s):// or protocol-relative //host…
# Allowed in resource positions: relative, /rooted, ./, data:, blob:, #frag.
while IFS= read -r f; do
  b="$(basename "$f")"
  case "$b" in
    *.html)
      grep -E '<(script|img|source|track|iframe)[^>]+(src|href)="(https?:)?//[a-zA-Z0-9]' "$f" | sed "s|^|  $b: |" |
        grep -v 'type="application/json"' >/tmp/pc-scan.out || true
      [[ -s /tmp/pc-scan.out ]] && { cat /tmp/pc-scan.out >&2; fail "$f: external script/img/iframe src"; }
      grep -Eq '<link[^>]+href="(https?:)?//[a-zA-Z0-9]' "$f" && fail "$f: external <link href>"
      grep -Eq '<use[^>]+href="(https?:)?//[a-zA-Z0-9]' "$f" && fail "$f: external SVG <use>"
      ;;
    *.css)
      grep -Eo 'url\(["'"'"']?(https?:)?//[a-zA-Z0-9][^)]*\)' "$f" | sed "s|^|  $b: |" >/tmp/pc-scan.out || true
      [[ -s /tmp/pc-scan.out ]] && { cat /tmp/pc-scan.out >&2; fail "$f: external CSS url()"; }
      grep -Eq '@import[[:space:]]+(url\()?["'"'"']?(https?:)?//' "$f" && fail "$f: external CSS @import"
      ;;
    *.js|*.mjs)
      grep -Eo 'import\(["'"'"'](https?:)?//[a-zA-Z0-9][^)"'"'"']*' "$f" | sed "s|^|  $b: |" >/tmp/pc-scan.out || true
      [[ -s /tmp/pc-scan.out ]] && { cat /tmp/pc-scan.out >&2; fail "$f: external dynamic import()"; }
      ;;
  esac
done < <(find "$DIST" -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.mjs' \))
rm -f /tmp/pc-scan.out

if (( violations > 0 )); then
  echo "check-selfcontained: FAIL — $violations external resource load(s) in $DIST (SPEC §8.6, N7/N11)" >&2
  exit 1
fi
echo "check-selfcontained: OK — no external-origin resource loads in $DIST"
