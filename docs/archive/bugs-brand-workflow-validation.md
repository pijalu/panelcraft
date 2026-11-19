<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: brand, presentation and browser-workflow validation

Source: `bugs.md`. This record closes the responsive branding and collapsed-panel
requests together with defects found by the subsequent dedicated browser-testing pass.
No deployment or hosted-site verification is claimed by this local validation record.

## Responsive header and collapsed default workspace

**Observed:** the wordmark consumed narrow-header space, Present had a text label, the
hamburger was not rightmost, and a fresh workspace opened Shapes while the other panels
were collapsed.

**Plan:** add wide/narrow assertions for visibility, accessible names, tooltip, control
order and horizontal containment; change the fresh/reset defaults without overwriting a
valid saved layout; review both themes at the breakpoint and on either side of it.

**Fix:** the supplied icon is beside the wide wordmark. Below 720 px only the icon remains,
with `alt="PanelCraft"`; the decorative wide wordmark is hidden from accessibility APIs to
avoid a duplicate announcement. Present is icon-only with the `Present a flow` tooltip and
accessible name, and precedes the rightmost hamburger. Fresh/reset layouts expose all five
panels as collapsed rails. Existing saved layouts still restore.

## Presentation retained editing chrome

**Observed:** selecting an element and presenting a flow retained the selected outline and
eight resize handles. The handles followed the presentation camera.

**Plan:** cover C4, Flow and Mermaid templates through selection, Flow Steps, presentation,
camera movement and exit; prove that flow animation remains visible and that the underlying
selection is retained rather than discarded.

**Fix:** the canvas controller has an editing-chrome visibility port. Presentation suppresses
selection/link outlines and overlay content without clearing document selection or the
separate animation layer. Exit restores the selection and its eight handles.

## Template names and stale SVG accessible names

**Observed:** the report said items were unnamed in all templates. Direct insertion and reload
showed the correct visible and accessible names for every C4, Flow and Mermaid object, so no
template text was changed. Broader browser testing did reproduce a related defect: after a
Properties rename, the visible label said Checkout API while the existing SVG group still had
`aria-label="system System 1"`.

**Plan:** retain the all-template name guard, add a renderer regression for structural rebuilds,
and cover both Properties and inline rename. Refresh metadata on the existing SVG group without
changing unchanged-object or move-only fast paths.

**Fix:** the renderer's structural rebuild now updates the accessible name from the current kind
and name, including the id fallback. The SVG group keeps its stable identity.

The renderer regression was RED before the fix (`system Checkout API` expected, `system System 1`
received). The browser Properties and inline-rename assertions also failed against the old bundle.

## Restoring the active snapshot left stale views

**Observed:** save a snapshot, rename an object, then restore while the same file remains active.
The manager replaced its workspace tree, but canvas and code still showed the post-snapshot name.
Both document loaders skipped the emission because the active path/document key was unchanged.

**Plan:** add save → same-file edit → restore → canvas/code agreement → reload coverage; invalidate
both same-document load guards before restoring; preserve in-place restoration without a page reload.

**Fix:** the code-sync port now has the same resynchronization capability as the canvas port. The
snapshot dialog's Restore action invalidates both guards before applying the restored workspace.

The browser regression was RED before the fix: `system Before snapshot` was expected and
`system After snapshot` remained after Restore. It passes after the fix, including reload persistence.

## Offline readiness probe and cached icon response

**Observed:** an early exploratory probe treated an active-worker predicate as installation
readiness, then reloaded before the executable assets were committed. The resulting blank page was
a probe error, not evidence of a worker install failure. The journey now waits for an activated
registration and actual HTML, JavaScript, CSS and icon cache entries.

Screenshot review then found a separate real defect that DOM visibility checks missed: after an
offline reload the brand image was broken and its alt text overlapped the wordmark. The worker's
non-asset fallback returned the cached HTML shell before trying the matching cached icon request.

**Plan:** assert the complete content-versioned precache, run a real template workflow offline, and
check the image's intrinsic width. Change only the fetch fallback order; do not alter consented
updates or speculative installation timing.

**Fix:** exact cached requests win during offline fallback. Only document navigation may fall back
to the HTML shell. The permanent offline test requires the brand image to decode to 192 px and then
inserts and edits the C4 template with the network offline.

The strengthened test was RED before the worker fix (`naturalWidth` expected 192, received 0). The
fresh offline capture shows the supplied icon correctly with no overlapping alt text.

## Test-harness corrections kept separate from product defects

- Browser scenarios that need Shapes now open it explicitly instead of assuming the old default.
- The narrow-shell scenario opens a panel before expecting its overlay drawer.
- A file-creation probe initially entered `diagrams/second.pcd` while the newly created `diagrams`
  folder was selected. The resulting nested path was correct product behavior; the probe was fixed
  to enter `second.pcd`.
- Concurrent Playwright commands sharing the default output directory were stopped because a new
  run removes another run's traces. Final evidence comes from one complete, exclusive run.

## Final validation evidence

- `npm run check` → TypeScript, service-worker TypeScript and ESLint passed.
- `npm test` → **156 files, 1,733 tests passed**; coverage thresholds passed. Overall coverage:
  87.07% statements, 79.05% branches, 84.23% functions and 89.92% lines. Core render coverage is
  98.33% lines; workspace coverage is 93.41% lines.
- `npx playwright test --reporter=line` → **264 passed** in one complete run; log:
  `test-results/full-e2e-pass3.log` (gitignored).
- `node test-results/exploratory/journeys.mjs` → **3 journeys passed**: authoring/history/reload/
  PDL/Mermaid/SVG/PNG export/presentation/snapshot/invalid-code recovery; files/import/search/tabs/
  layout/theme; installed offline shell/template. No page errors or external requests.
- `node test-results/exploratory/responsive.mjs` → **14 responsive/theme states passed**, plus
  keyboard-menu and focus-restoration checks; no page errors or external requests.
- Focused offline tests → **2 passed**; update/installability and banner tests → **5 passed**.
- `go vet ./...`, `staticcheck ./...` and `gocyclo -over 15 cmd internal web` → no findings.
- `go test -count=1 -race -cover ./...` → all packages passed with the race detector.

## Screenshot and accessibility review

Reviewed the final `test-results/exploratory/` captures for wide and 320 px first-run states,
light/dark presentation, narrow presentation, restored authoring/files and offline template use.
The wordmark/icon boundary behaves as requested, controls stay inside the viewport, collapsed rails
remain legible, and presentation contains no selection or resize chrome. The final offline capture
shows the decoded brand icon. Automated accessibility scenarios are included in the complete unit
and browser suites above; screenshots supplement rather than replace those assertions.
