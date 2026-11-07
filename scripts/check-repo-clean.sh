#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# check-repo-clean.sh — F-09 repo-hygiene gate (review §7).
#
# Fails when
#   1. any generated artefact is tracked (`dist/**`, `e2e/__screenshots__/**`,
#      `test-results/**`, `playwright-report/**`, `coverage/**`), or
#   2. the worktree is dirty — which is how every e2e run used to end.
#
# Run after e2e in CI (`--worktree`) and as part of scripts/verify.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

generated="$(git ls-files -- 'dist/**' 'e2e/__screenshots__/**' 'test-results/**' \
  'playwright-report/**' 'coverage/**' || true)"
if [[ -n "$generated" ]]; then
  echo "tracked generated artefacts (must be gitignored):" >&2
  echo "$generated" >&2
  fail=1
fi

if [[ "${1:-}" == "--worktree" ]]; then
  dirty="$(git status --porcelain || true)"
  if [[ -n "$dirty" ]]; then
    echo "worktree is dirty after the run (tests must not write into tracked files):" >&2
    echo "$dirty" >&2
    fail=1
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "repo-hygiene gate: FAIL" >&2
  exit 1
fi
echo "repo-hygiene gate: OK (no generated content tracked, worktree clean)"
