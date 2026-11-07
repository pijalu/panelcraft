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

# ---- m5 stages (flows & animation; reuses m1 corpus gates) -------------------
# flows_anim: focused run of the playback suite — step machine + plan builder
# (M5-WP1) and anim engine with Clock/AnimPlayer ports (M5-WP2/3) — all
# deterministic (fake clock, injected player; no real timers in CI).
flows_anim() { run npx vitest run web/src/engine/flows/ web/src/engine/anim/; }
# e2e now includes S3 (play mode over a 6-step flow; M5-WP8).
e2e_m5() { run npm run e2e -- --project=chromium; }

# ---- m6 stages (views/tags/layout/search/snapshots; reuses m1 corpus gates) --
# layout_engine: dagre adapter determinism + pin handling + apply-to-file
# commit (M6-WP3) — pure functions, no DOM.
layout_engine() { run npx vitest run web/src/engine/layout/; }
# views_search: named-view apply/remove model ops (M6-WP2), dependencies
# adjacency (M6-WP4), quick-search fuzzy index (M6-WP5).
views_search() { run npx vitest run web/src/ui/views/ web/src/ui/search/; }
# snapshots: IDB snapshot store save/restore/prune incl. versioned restore
# (M6-WP6).
snapshots() { run npx vitest run web/src/workspace/store/; }
# e2e now includes S5 (tag filter fade, view switch, layout determinism
# smoke, search jump; M6-WP8).
e2e_m6() { run npm run e2e -- --project=chromium; }

# ---- m7 stages (hardening & release; reuses all earlier gates) ---------------
# perf_nfr: N1–N3 budgets as hard assertions (M7-WP2, SPEC §5) — synthetic
# scene ops budgets (N1), 100-object open-to-interactive (N2), 10k-line parse
# (N3). Layer virtualization/culling only if a budget is missed.
perf_nfr() { run npx vitest run web/src/engine/perf/; }
# svg_fuzz: property/fuzz tests for the SVG export sanitizer — random hostile
# labels (scripts, foreignObject, event attrs, entities) must sanitize clean
# (M7-WP4, N6).
svg_fuzz() { run npx vitest run web/src/workspace/sanitize.fuzz.test.ts; }
# cli_traversal: Go CLI path-traversal gates — workspace-escape (P103) via CLI
# validate, output-path handling, server /files traversal (M7-WP4, N6).
cli_traversal() { run go test ./cmd/panelcraft/ ./internal/server/ -run 'Traversal|Escape' -count=1; }
# a11y_e2e: axe-core WCAG 2.1 AA scan over app + every dialog, both themes
# (M7-WP1, N5).
a11y_e2e() { run npm run e2e -- --project=chromium e2e/m7-a11y.spec.ts; }
# offline_e2e: service-worker offline shell — reload with network cut, app +
# assets served from SW cache (M7-WP3, N8).
offline_e2e() { run npm run e2e -- --project=chromium e2e/m7-offline.spec.ts; }
# docs_links: README/ARCHITECTURE/user guide/CLI ref/CHANGELOG — relative links
# resolve; embedded examples validate via the CLI (M7-WP5).
docs_links() { run bash scripts/check-docs.sh; }
# release_dry: dry-run release — binary matrix linux/darwin/windows × amd64/arm64
# (CGO off, web/dist embedded), sha256 checksums, pages artifact, boot-smoke
# (M7-WP6, N4/N11).
release_dry() { run bash scripts/release.sh --dry-run; }
# e2e now includes S6-shaped m7 additions (axe + offline) next to S1–S5/S7.
e2e_m7() { run npm run e2e -- --project=chromium; }

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
  m5)
    STAGES=(web_check web_test perf_smoke workspace_unit sync_machine exporter_goldens flows_anim web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs selfcontained e2e_m5)
    ;;
  m6)
    STAGES=(web_check web_test perf_smoke workspace_unit sync_machine exporter_goldens flows_anim layout_engine views_search snapshots web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs selfcontained e2e_m6)
    ;;
  m7)
    STAGES=(web_check web_test perf_smoke perf_nfr workspace_unit sync_machine exporter_goldens flows_anim layout_engine views_search snapshots svg_fuzz cli_traversal web_build go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs docs_links selfcontained a11y_e2e offline_e2e e2e_m7 release_dry)
    ;;
  *)
    echo "verify.sh: unknown milestone '$MILESTONE' (known: m0, m1, m2, m3, m4, m5, m6, m7)" >&2
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
