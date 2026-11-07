#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# check-docs.sh — docs completeness gate (M7-WP5): every relative link in the
# shipped docs resolves to a real file; .pcd code blocks validate via the CLI
# (dogfooding, SPEC §14 style); no external http(s) links to tracker/CDN
# domains in the shipped set (self-containment spirit, N7).
set -euo pipefail
cd "$(dirname "$0")/.."

DOCS=(README.md agents.md docs/SPEC.md docs/FILE-FORMAT.md
      docs/ARCHITECTURE.md docs/USER-GUIDE.md docs/CHANGELOG.md
      docs/STYLE-GUIDE.md docs/IMPLEMENTATION-PLAN.md)

FAIL=0
for f in "${DOCS[@]}"; do
  [[ -f "$f" ]] || { echo "check-docs: missing required doc: $f" >&2; FAIL=1; continue; }
  # relative markdown links must resolve (repo-root relative to the doc's dir)
  dir="$(dirname "$f")"
  while IFS= read -r link; do
    [[ "$link" =~ ^https?:// ]] && continue
    [[ "$link" =~ ^\.\./\.\./actions$ ]] && continue # CI badge (GH-relative)
    [[ "$link" =~ [\[\]()] ]] && continue # grammar notation inside link parens (false positive)
    [[ "$link" =~ ^\{\{ ]] && continue # template placeholders (SPEC links)
    target="${link%%#*}"
    [[ -z "$target" ]] && continue
    resolved="$dir/$target"
    if [[ ! -e "$resolved" ]]; then
      echo "check-docs: $f → broken link: $link" >&2
      FAIL=1
    fi
  done < <(grep -oE '\]\(([^)#]+)(#[^)]*)?\)' "$f" | sed -E 's/\]\(([^)#]+)(#[^)]*)?\)/\1/' | sort -u)
done

# .pcd fences (plain ``` or ```pcd) in FILE-FORMAT must parse (dogfooding):
# the spec's examples carry inline ← annotations, so strip comments starting
# with ← before validating. Only fence blocks whose first line looks like a
# header (pcd 1.0) are treated as .pcd.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
n=0
while IFS= read -r block; do
  n=$((n + 1))
  first="$(printf '%s' "$block" | head -1)"
  [[ "$first" == "pcd 1.0"* ]] || continue
  printf '%s\n' "$block" | sed -E 's/←.*$//' > "$TMP/block-$n.pcd"
  if ! go run ./cmd/panelcraft validate "$TMP/block-$n.pcd" > /dev/null 2>&1; then
    echo "check-docs: .pcd block $n fails validation (see $TMP/block-$n.pcd content)" >&2
    FAIL=1
  fi
done < <(awk '/^```(pcd)?$/{f=1;next} /^```$/{f=0} f' docs/FILE-FORMAT.md)

if (( FAIL != 0 )); then
  echo "check-docs: FAILED" >&2
  exit 1
fi
echo "check-docs: OK — ${#DOCS[@]} docs, all links resolve, .pcd blocks valid"
