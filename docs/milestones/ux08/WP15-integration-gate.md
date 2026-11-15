<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP15 — Integrated verification and release gate

**Severity:** High — release confidence across coupled UI changes

**Status:** Implemented and verified (2026-11-15)  
**Requirements:** all UX-08 requirements  
**Depends on:** WP01–WP14 merged; this WP is verification/fix integration, not a place to hide
unfinished feature work  
**Branch:** `feat/ux08-integration-gate`

## Single-task outcome

Prove the combined application works, accessible and offline, without performance, corpus or
repository-hygiene regressions. Fix only integration defects with a regression test; send feature
gaps back to their owning WP.

## Execution steps

1. Add a focused `ux08` stage to `scripts/verify.sh` covering the new suites, then run all existing
   stages. Confirm each new test exercises the original requirement; a green unrelated test is
   not evidence.
2. Run keyboard-only menu dismissal, panel use, link geometry, flow creation, presentation and
   documentation scenarios. Run axe in light/dark and reduced-motion checks.
3. Re-run the 300-object pan/zoom/drag baseline after overlay/label changes. Investigate any N1
   regression with before/after measurements rather than raising the budget.
4. Run network-blocked offline/update/PWA checks and asset scans at root and configured base path.
   Confirm no external assets, runtime calls, service-worker user data or generated dist tracking.
5. Perform bounded vision reviews: shell/canvas and flow/presentation, light/dark, including
   classic scrollbars, narrow/standalone layouts and animation end states. File and fix defects,
   then re-shoot. Curated goldens change only through the approved update path.
6. Update SPEC, user guide and changelog only for behavior actually shipped. Record any residual
   limitation explicitly; do not silently descope a requirement.

## Required final checks

```bash
npm run check
npx vitest run
npm run build
npx playwright test
go test ./...
go vet ./... && staticcheck ./...
gocyclo -over 15 cmd internal web && echo OK
bash scripts/check-docs.sh
bash scripts/check-selfcontained.sh
bash scripts/check-repo-clean.sh --worktree
```

For the WP11 format change, also cite the already-run corpus regeneration/parity and architecture
validation evidence. After full E2E, inspect `git status --porcelain`; only deliberate source and
reviewed golden changes may remain.

## Acceptance

- Every WP01–WP14 brief contains actual focused evidence and no unresolved acceptance item.
- All commands above pass with recorded output; accessibility, reduced motion, performance and
  offline/privacy gates are green.
- Vision-review findings and screenshot references are resolved or filed with owner/severity.
- Worktree is clean after committing intended changes; no unverified “done” claim remains.

## Evidence

**New gate.** `scripts/verify.sh` gained the `ux08` milestone (22 stages) so the whole of UX-08 is
one reproducible command rather than a checklist. `ux08_unit` groups the suites by requirement —
menu/shell/panels (WP01–WP03, WP07), grid and resize cues (WP05–WP06), link properties, route
geometry and labels (WP08–WP10), flow authoring/presentation/documentation (WP11–WP14) and the PWA
lifecycle (WP04); `perf_baseline` re-runs the 300-object pan/zoom/drag measurement, `a11y_e2e` and
`offline_e2e` keep the accessibility and network-blocked gates, `e2e_ux08` runs every delivered
scenario and `e2e_full` runs the whole suite before `repo_clean`.

```
$ bash scripts/verify.sh ux08 web_check web_test ux08_unit perf_smoke perf_nfr web_build \
    go_vet go_static go_cyclo go_test corpus_ir corpus_ts corpus_go validate_docs docs_links \
    selfcontained
ALL STAGES GREEN — ux08 gate passed          (16.8 s)
$ bash scripts/verify.sh ux08 a11y_e2e offline_e2e perf_baseline e2e_ux08
stage a11y_e2e        6 passed (1.1s)        # axe WCAG 2.1 AA, app + dialogs, light/dark
stage offline_e2e     2 passed (1.3s)        # network cut, shell from the service worker
stage perf_baseline   1 passed (4.6s)        # 300-object pan/zoom/drag within N1 budgets
stage e2e_ux08       50 passed (26.7s)       # every UX-08 scenario + FLOW-01 authoring
ALL STAGES GREEN — ux08 gate passed          (35.2 s)
$ bash scripts/verify.sh ux08 e2e_full
  155 passed (1.1m)
$ git status --porcelain
 M scripts/verify.sh                        # only the intended gate change — e2e wrote no diff
```

Stage output cited above is the real run transcript; the focused numbers are:

```
$ npx vitest run
 Test Files  119 passed (119)   Tests  1300 passed (1300)
$ npm run check
(no output: tsc, tsc -p tsconfig.sw.json, eslint clean)
$ npm run build
✓ built in 116ms
$ go test ./... && go vet ./... && staticcheck ./... && gocyclo -over 15 cmd internal web
GATES_OK
$ bash scripts/check-docs.sh && bash scripts/check-selfcontained.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
check-selfcontained: OK — no external-origin resource loads in web/dist
```

**Requirements walked end to end** (keyboard only, both themes): menu dismissal (Esc, outside
click, focus return — `e2e/ux08-shell.spec.ts`), panel use with classic scrollbars and the narrow
layout (scroll-into-view assertions in `e2e/ux08-panels.spec.ts`), link geometry handles
(`e2e/ux08-connection-editing.spec.ts`, `routeEditing.test.ts`), flow creation from the selection
(`e2e/ux08-flow-authoring.spec.ts`, `e2e/flow01-canvas-flows.spec.ts` light + dark), presentation
with camera overrides and reduced motion (`e2e/ux08-flow-presentation.spec.ts`) and documentation
downloads compared to the goldens (`e2e/ux08-flow-documentation.spec.ts`). Each spec asserts the
behaviour named in its WP brief, not a proxy.

**Performance.** `perf_smoke` (300-object synthetic scene) and `perf_nfr` (N1–N3 budgets, incl.
100-object open-to-interactive and 10k-line parse) are unchanged and green, and `perf_baseline`
re-measured the 300-object pan/zoom/drag path in a real browser after the overlay, label and panel
work — no budget was raised and no measurement regressed, so nothing was "fixed" by moving a
number.

**Offline and privacy.** `check-selfcontained.sh web/dist` reports no external-origin resource
loads, `e2e/m7-offline.spec.ts` reloads with the network cut and still serves the shell from the
service worker, and `e2e/ux08-pwa.spec.ts` covers install, the consented update offer and the
playback-queued update. Nothing new calls the network: the documentation export is generated in
memory from the parsed document and downloaded through the existing blob adapter.

**Vision review** (bounded, `test-results/screenshots/`, light + dark): shell/canvas
(`ux08-shell-{light,dark}`, `ux08-narrow-{light,dark}`, classic scrollbars and standalone narrow
layout) and flow/presentation (`ux08-flow-authoring-shell-*`, `ux08-presentation-{launcher,step}-*`,
`ux08-documentation-actions-*`, reduced-motion framing). Findings across the milestone were fixed in
their owning WP with regression tests — collapsed panels showing stray hotkeys (WP02), missing
focus ring on menu items (WP01), the clipped/stray `.md` actions (WP14), the tab strip surviving
present mode and framing computed before the shell widened (WP13). The narrow shell re-shot here
shows collapsed rails with readable labels, a single focused panel and **Present** still reachable
at 520 px; no outstanding defect is filed.

**Residual limitations, recorded not fixed** (none of them a UX-08 requirement):

1. The canvas→file write window (~1 s) recorded in WP12: an edit typed into the code view during
   exactly that window can be overwritten; the sync chip warns and no UX-08 requirement asks for
   transactionality.
2. Palette quick-add digit keys shadow `fit-diagram` while the palette is focused.
3. The per-step delay input is always visible on step cards.
4. In present mode the beat token animation runs concurrently with the camera glide; neither blocks
   the other.
5. The Markdown documentation export is one-way — there is no Markdown import, and PDL stays the
   single normative source.

**Worktree.** After the full e2e run `git status --porcelain` showed only the intended
`scripts/verify.sh` change (this WP), and `bash scripts/check-repo-clean.sh --worktree` passes on
the committed tree; no generated artefact or refreshed golden was left behind.
