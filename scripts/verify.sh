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

# ---- m1 stages (M1-WP8 parity gates + WP9 docs validation) ------------------
# corpus_ir: TS⇄Go serializer byte-parity on the shared IR fixture.
corpus_ir()   { run go test ./internal/ir/...; }
# corpus_ts: TS parse/convert output matches committed goldens (all corpus files).
corpus_ts()   { run npm run corpus:check; }
# corpus_go: Go parse/convert output matches the same goldens ⇒ TS⇄Go parity.
corpus_go()   { run go test ./internal/corpus/...; }
# validate_docs: dogfooding gate — PanelCraft's own architecture validates (WP9).
validate_docs() {
  run go run ./cmd/panelcraft validate docs/architecture
}

# ---- m2 stages (canvas MVP; reuses m1 corpus gates) ---------------------------
# perf_smoke: render-perf sanity — 300-object synthetic scene renders+re-patches
# under budget (N1 evidence for M2.md; full pan/drag baseline via e2e/PW traces).
perf_smoke() {
  run npx vitest run web/src/engine/render/perf.test.ts
}
# e2e now includes S1 (canvas create-flow) next to the S7 no-network smoke.
e2e_m2() { run npm run e2e -- --project=chromium; }

# ---- m3 stages (workspace & storage; reuses m1 corpus gates) -----------------
# workspace_unit: focused run of the workspace suite (fs/tabs/store/zip/io).
workspace_unit() { run npx vitest run web/src/workspace/; }
# e2e now includes S4 (workspace zip → clear → import; FR-S2/S3 paths).
e2e_m3() { run npm run e2e -- --project=chromium; }

# ---- m4 stages (code view & mermaid export; reuses m1 corpus gates) ----------
# sync_machine: focused run of the code view suite — sync state machine
# transition tests (M4-WP2, test-first), CodeMirror adapter, diagnostics map.
sync_machine() { run npx vitest run web/src/ui/codeview/; }
# exporter_goldens: mermaid export goldens per corpus file + re-import
# property test (M4-WP5, FILE-FORMAT §9 / FR-M4).
exporter_goldens() { run npx vitest run web/src/engine/format/mermaidExport.test.ts; }
# e2e now includes S2 (mermaid paste → canvas → edit → code updates; M4-WP6).
e2e_m4() { run npm run e2e -- --project=chromium; }

case "$MILESTONE" in
  m0)
    STAGES=(web_check web_test web_build go_vet go_static go_cyclo go_test selfcontained e2e_smoke)
    ;;
  m1)
    STAGES=(web_check web_test web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs selfcontained e2e_smoke)
    ;;
  m2)
    STAGES=(web_check web_test perf_smoke web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs selfcontained e2e_m2)
    ;;
  m3)
    STAGES=(web_check web_test perf_smoke workspace_unit web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs selfcontained e2e_m3)
    ;;
  m4)
    STAGES=(web_check web_test perf_smoke workspace_unit sync_machine exporter_goldens web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs selfcontained e2e_m4)
    ;;
  *)
    echo "verify.sh: unknown milestone '$MILESTONE' (known: m0, m1, m2, m3, m4)" >&2
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
