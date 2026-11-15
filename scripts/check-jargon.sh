#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Reject newly added opaque references (BUG-09).
#
# The repo tags work with short identifiers — "M7", "SPEC §8.5", "FR-K3", "N7",
# "F-24", "UX08-WP13". Inside a commit message, comment or doc they mean nothing
# to a reader who has not memorised docs/SPEC.md, so every new line must say what
# it means in plain words: "the offline-only rule (no runtime network calls)",
# not "N7" on its own. A pointer is fine once the sentence stands without it.
#
# agents.md is exempt (it defines the tags) and so is docs/archive (closed
# write-ups quote them when describing the problem).
#
# Usage: bash scripts/check-jargon.sh [base-ref]
#   base-ref defaults to origin/main (CI) or HEAD (nothing to check locally).
set -euo pipefail
cd "$(dirname "$0")/.."

base="${1:-origin/main}"
if ! git rev-parse --verify --quiet "$base" >/dev/null; then
  base="HEAD"
fi

pattern='(SPEC §[0-9]|FR-[A-Z]+[0-9]+|N[0-9]{1,2}([^0-9]|$)|F-[0-9]{2}([^0-9]|$)|M[0-9]+-WP[0-9]+|WP[0-9]{2}([^0-9]|$)|UX[0-9]{2}|CX-[0-9]{2}|P[0-9]+-WP[0-9]+)'

# Committed/uncommitted changes, then whole new files (a fresh file has no diff).
committed="$(
  git diff -U0 "$base" -- '*.ts' '*.tsx' '*.go' '*.css' '*.md' ':!agents.md' ':!docs/archive/**' \
    | grep -E '^\+' \
    | grep -vE '^\+\+\+' \
    | grep -E "$pattern" || true
)"

fresh="$(
  git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.go' '*.css' '*.md' \
    | grep -vE '^(agents\.md|docs/archive/)' \
    | xargs -r grep -HE "$pattern" 2>/dev/null || true
)"

hits="$(printf '%s\n%s\n' "$committed" "$fresh" | sed '/^$/d')"


if [ -n "$hits" ]; then
  echo "Opaque identifier-only references added since $base:" >&2
  echo "$hits" >&2
  cat >&2 <<'MSG'

Say what the identifier stands for instead: "the offline-only rule (no runtime
network calls)" rather than "N7". A short pointer is fine only after the plain
sentence. Glossary: agents.md → "Identifiers in this repo".
MSG
  exit 1
fi

echo "OK — no opaque identifier-only references added since $base"
