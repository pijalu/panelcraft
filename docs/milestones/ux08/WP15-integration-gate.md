<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP15 — Integrated verification and release gate

**Severity:** High — release confidence across coupled UI changes

**Status:** Proposed  
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

Pending. Record full-gate output, performance numbers, accessibility/network results, screenshot
review outcomes and residual risks here.
