<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-07 Remove the stray diagnostic `0` below the header

**Status:** closed after implementation and validation.

## Observed behavior

Live browser and curated screenshots showed a stray `0` at the upper-left below the header.
`ShellBanners.tsx` placed the diagnostic count in `span.sr-only`, but no `.sr-only` rule existed
in `app.css`. The span therefore used static positioning and participated in the shell's flex
layout, painting the zero over the canvas.

## Expected behavior

- Show no numeric diagnostic artifact when there are no problems.
- Keep the diagnostic count available to assistive technology without affecting visual layout.
- Preserve the visible problem chip and stale-render message for parse errors.
- Remove the stale diagnostic state after the code recovers.

## Executed plan

1. Added a reusable `.sr-only` utility using absolute positioning, a 1 px box, negative margin,
   clipping, hidden overflow, and nowrap text. It remains in the accessibility tree while staying
   out of visual layout.
2. Made the diagnostic count a polite, atomic `role="status"` live region. No visible problem
   message was hidden or removed.
3. Added isolated light/dark browser regressions for empty, valid, parse-error, and recovered
   states. Assertions cover clipping geometry, zero/nonzero counts, the visible problem message,
   and recovery. Actual ARIA snapshots are attached to the focused JSON report.
4. Captured and reviewed the four states in both themes, added the changelog entry, and archived
   this executed plan.
5. The common browser gate exposed a separate workspace-hydration race in existing E2E seeding
   helpers. Failure captures showed duplicate initial `pcd 1.0` headers. Applied the established
   wait-for-hydration then select-all pattern and fixed it separately in commit `14a658b`; no
   application behavior changed.

## Test approach and results

The new regression was run before the fix:

- `npx playwright test e2e/p3-diagnostics.spec.ts --grep UX-07`: **RED** as intended; expected
  `position: absolute`, received `static`. The captured empty light state showed the stray zero.

After the fix:

- `npx playwright test e2e/p3-diagnostics.spec.ts --grep UX-07 --reporter=json`: **2 passed**,
  with zero unexpected/flaky results.
- `npx playwright test e2e/p3-diagnostics.spec.ts`: **4 passed**.
- `npx playwright test e2e/m7-a11y.spec.ts`: **6 passed**, including light/dark WCAG 2.1 AA axe
  scans.

### Accessibility evidence

The actual snapshots in `test-results/ux07-accessibility-report.json` were decoded and inspected:

- Light and dark empty states: `- status: "0"`.
- Light and dark parse-error states: `- status: "1"`.
- Light and dark recovered states: `- status: "0"`.

Thus the count remains exposed as a status while the visual utility clips it. The visible
`Diagram out of date — fix 1 problem in the code view.` message and header problem chip remain.

### Visual review

Reviewed these actual captures against the style-guide checklist:

- `test-results/screenshots/ux07-empty-light.png`
- `test-results/screenshots/ux07-empty-dark.png`
- `test-results/screenshots/ux07-valid-light.png`
- `test-results/screenshots/ux07-valid-dark.png`
- `test-results/screenshots/ux07-error-light.png`
- `test-results/screenshots/ux07-error-dark.png`
- `test-results/screenshots/ux07-recovered-light.png`
- `test-results/screenshots/ux07-recovered-dark.png`

No stray zero appears in any final capture. Empty and valid states retain panel alignment, theme
contrast, spacing, and empty-state content. Error states retain readable visible diagnostics;
recovery removes the stale state and restores the valid layout. The existing stale-banner flex
geometry is unchanged and remains within UX-02's planned shell rework. No animation or focus state
was changed.

## Validation evidence

All commands were run separately and their actual output inspected:

- `npm run check`: TypeScript and ESLint passed.
- `npm test`: **84 files / 909 tests passed**; coverage thresholds passed.
- `npm run build`: passed; the existing bundle-size warning remains.
- `npx playwright test`: **73 passed**, including UX-07, axe, offline/no-network, and performance.
- `go vet ./...`: passed.
- `staticcheck ./...`: passed.
- `go test -count=1 -race -cover ./...`: passed.
- `bash scripts/check-docs.sh`: **OK — 9 docs, all links resolve, .pcd blocks valid**.
- `gocognit -over 15 .`: unchanged pre-existing findings in vendored flatted, existing Go tests,
  corpus parity, and Mermaid conversion; no Go code changed.
- `gocyclo -over 12 .`: unchanged pre-existing findings in vendored flatted, existing Go
  parser/printer/lexer and tests; no Go code changed.
