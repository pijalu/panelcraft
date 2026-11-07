#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
#
# verify.sh — CI-equivalent local gate runner (agents.md / SPEC §8).
#
# Usage:
#   bash scripts/verify.sh <milestone> [stage...]   run all stages, or named subset
#   bash scripts/verify.sh <milestone> --list       list stages
#
# Milestones:
#   m0  scaffolding gate: web check+test+build, go vet/staticcheck/gocyclo/test,
#       asset-origin scan, e2e no-network smoke.
# Later milestones extend STAGES below (docs/IMPLEMENTATION-PLAN.md).
set -euo pipefail
cd "$(dirname "$0")/.."

MILESTONE="${1:-m0}"
shift || true

log()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
run() { printf '\033[1;33m$ %s\033[0m\n' "$*"; "$@"; }

# ---- m0 stages --------------------------------------------------------------
web_check()   { run npm run check; }
web_test()    { run npm test; }
web_build()   { run npm run build; }
go_vet()      { run go vet ./...; }
go_static()   { run staticcheck ./...; }
go_cyclo() {
  log 'gocyclo -over 15 (CI fails >15; target ≤10)'
  # Scoped to repo-owned dirs: gocyclo has no exclude list and third-party
  # code under node_modules/** must not pollute the gate (M0 decision, M0.md).
  out="$(gocyclo -over 15 cmd internal web || true)"
  if [[ -n "$out" ]]; then
    echo "$out"
    echo "gocyclo: functions above 15 found — FAIL" >&2
    exit 1
  fi
  echo "gocyclo: OK (no functions above 15)"
}
go_test()     { run go test ./...; }
selfcontained() { run bash scripts/check-selfcontained.sh web/dist; }
e2e_smoke()   { run npm run e2e -- --project=chromium; }

case "$MILESTONE" in
  m0)
    STAGES=(web_check web_test web_build go_vet go_static go_cyclo go_test selfcontained e2e_smoke)
    ;;
  *)
    echo "verify.sh: unknown milestone '$MILESTONE' (known: m0)" >&2
    exit 2
    ;;
esac

if [[ "${1:-}" == "--list" ]]; then
  printf '%s\n' "${STAGES[@]}"
  exit 0
fi

if (( $# > 0 )); then
  requested=("$@")
  for r in "${requested[@]}"; do
    known=false
    for s in "${STAGES[@]}"; do [[ "$r" == "$s" ]] && known=true; done
    if ! $known; then
      echo "verify.sh: stage '$r' not in $MILESTONE (run with --list)" >&2
      exit 2
    fi
  done
  STAGES=("${requested[@]}")
fi

log "verify.sh — milestone $MILESTONE — ${#STAGES[@]} stage(s)"
failed=()
for stage in "${STAGES[@]}"; do
  log "stage: $stage"
  if ! "$stage"; then
    failed+=("$stage")
    echo "verify.sh: stage '$stage' FAILED" >&2
  fi
done

log "verify.sh — summary"
if (( ${#failed[@]} > 0 )); then
  printf 'FAILED stages: %s\n' "${failed[*]}"
  exit 1
fi
echo "ALL STAGES GREEN — $MILESTONE gate passed"
