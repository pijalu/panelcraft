#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# deploy-gate.test.sh — the publication decision, checked against real commits.
#
# Builds throwaway repositories and asks `scripts/deploy-gate.sh` for a verdict on
# each situation the release has actually hit, so the rule that decides whether
# the site gets a new build is testable without pushing anything.
set -euo pipefail
cd "$(dirname "$0")/.."

GATE="$PWD/scripts/deploy-gate.sh"
fail=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass() { echo "ok   — $1"; }
bad()  { echo "FAIL — $1" >&2; fail=1; }

# A fresh repo with a web source tree, a docs tree and a committed baseline.
new_repo() {
  local dir="$1"
  mkdir -p "$dir/web/src" "$dir/docs"
  git -C "$dir" init -q
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name Test
  echo 'export const x = 1;' > "$dir/web/src/main.ts"
  echo '# spec' > "$dir/docs/SPEC.md"
  git -C "$dir" add -A
  git -C "$dir" commit -qm baseline
}

verdict_for() { # <repo> <head> [served]
  local repo="$1" head="$2" served="${3:-}"
  if [[ -n "$served" ]]; then
    bash "$GATE" --repo "$repo" --head "$head" --served "$served" | tail -1
  else
    bash "$GATE" --repo "$repo" --head "$head" | tail -1
  fi
}

expect_verdict() { # <label> <expected> <repo> <head> [served]
  local label="$1" expected="$2" repo="$3" head="$4" served="${5:-}"
  local got
  got="$(verdict_for "$repo" "$head" "$served")"
  if [[ "$got" == "publish=$expected" ]]; then
    pass "$label"
  else
    bad "$label (expected publish=$expected, got '$got')"
  fi
}

# 1. First publication: nothing is served yet.
r="$tmp/first"; new_repo "$r"
expect_verdict "first publication publishes" true "$r" HEAD ""

# 2. The site already serves this commit.
r="$tmp/same"; new_repo "$r"
expect_verdict "already-served commit is skipped" false "$r" HEAD "$(git -C "$r" rev-parse HEAD)"

# 3. A documentation-only change since the served revision.
r="$tmp/docs"; new_repo "$r"
served="$(git -C "$r" rev-parse HEAD)"
echo '# more' >> "$r/docs/SPEC.md"
git -C "$r" commit -qam "docs only"
expect_verdict "docs-only change is skipped" false "$r" HEAD "$served"

# 4. A shipped change since the served revision.
r="$tmp/web"; new_repo "$r"
served="$(git -C "$r" rev-parse HEAD)"
echo 'export const x = 2;' > "$r/web/src/main.ts"
git -C "$r" commit -qam "web change"
expect_verdict "shipped change publishes" true "$r" HEAD "$served"

# 5. The regression that stranded a released fix: a shipped change is followed
#    by a docs-only merge. Comparing head with its parent says "docs only" and
#    skips — but the site never received the shipped change either.
r="$tmp/stranded"; new_repo "$r"
served="$(git -C "$r" rev-parse HEAD)"
echo 'export const x = 3;' > "$r/web/src/main.ts"
git -C "$r" commit -qam "web change that never got published"
echo '# note' >> "$r/docs/SPEC.md"
git -C "$r" commit -qam "docs only merge on top"
# Prove the old rule would have skipped this, so the case is not passing by
# accident: the parent comparison sees documentation only.
parent_changed="$(git -C "$r" diff --name-only HEAD^1 HEAD)"
if echo "$parent_changed" | grep -q '^web/'; then
  bad "stranded case does not discriminate (parent diff already shows web/)"
else
  pass "stranded case discriminates: the parent diff is documentation only"
fi
expect_verdict "shipped change stranded behind a docs-only merge still publishes" true "$r" HEAD "$served"

# 6. An unknown served revision cannot be diffed; publishing is the safe answer.
r="$tmp/unknown"; new_repo "$r"
expect_verdict "unknown served revision publishes" true "$r" HEAD "0000000000000000000000000000000000000000"

# 7. A served revision that is not an ancestor (rewritten history).
r="$tmp/rewritten"; new_repo "$r"
git -C "$r" checkout -q -b side
echo '# side' >> "$r/docs/SPEC.md"
git -C "$r" commit -qam "side"
side="$(git -C "$r" rev-parse HEAD)"
git -C "$r" checkout -q master 2>/dev/null || git -C "$r" checkout -q main
expect_verdict "non-ancestor served revision publishes" true "$r" HEAD "$side"

# 8. A bad argument is an error, never a silent skip: exiting 0 here would let a
#    typo stop the site from ever updating.
if bash "$GATE" --head "not-a-sha" >/dev/null 2>&1; then
  bad "unknown head must exit non-zero"
else
  pass "unknown head exits non-zero"
fi

if (( fail != 0 )); then
  echo "deploy-gate self-test: FAIL" >&2
  exit 1
fi
echo "deploy-gate self-test: OK (8 cases + discrimination check)"
