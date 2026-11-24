<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: the diagram source is visible while you draw

Source: `bugs.md`, “Show the code view while drawing” and “Default flow is not
populated after drawing two linked entities”.
Status: closed after unit and browser regressions, light/dark screenshot review
and the full unit/browser/Go validation listed below.

## Report and expected behavior

The report had two symptoms from one fresh-profile drawing session: adding two
entities and linking them "results in an empty default flow", and "code stays
fully empty". The expected contract is that a fresh session shows the editable
diagram source alongside the canvas, that canvas edits update that source within
the documented debounce, that the drawn connection is a presentable Default flow,
and that the explicit single-pane controls stay available.

The UX lens is **Mental Model**: the source is the other half of the authoring
model, so hiding it makes the relationship between the canvas, the `.pcd` text
and the derived flow unpredictable — a user cannot tell whether a drawing was
recorded at all.

## Reproduction before the fix

Build under test: `npm run build` at `7c1065e` plus the uncommitted coverage
changes. A fresh browser profile (`test-results/repro-flow-code.mjs`, gitignored
throwaway) drew `Person 1` (key `1`), `System 1` (key `2`), moved the second
shape clear and connected them through the halo. Findings:

| Observation | Value |
|---|---|
| `data-panels` on a fresh profile | every panel `collapsed`, including `code` |
| Code pane visible after drawing | **no** — only a “Show code panel” rail |
| Editor buffer (hidden) | `pcd 1.0` / `person o1 "Person 1"` / `system o2 "System 1"` / `o1 -> o2 as l3` |
| Sync state | `clean` |
| Flow steps panel after opening it | `Default flow · 1 msg · Person 1 → System 1`, derived hint shown |
| Present launcher | `Default flow — 1 step · from the elements`, plays `1 / 1` |

So the synchronization and the derived Default flow were already correct on this
revision (`86f1b16` and `09e1412` fixed the engine side). The visible defect was
the default shell: the source was never shown, and the flow steps panel was only
a rail with no step count, which made a correct derivation look like an empty
flow. The earlier “canvas-first” default (`web/src/ui/uiLayout.ts`) contradicted
the product overview's requirement that the diagram source is always visible
(`docs/SPEC.md`, section 1) while the split layout and single-pane option stayed
specified (`FR-K1`).

Captures: `test-results/screenshots/repro-drawn-code-hidden.png` (before),
`repro-drawn-flows-open.png`, `repro-drawn-launcher.png`.

## Failing coverage first

This is an intentional default-layout contract correction, not removal of an
assertion to make the implementation pass.

Unit (`npx vitest run web/src/ui/uiLayout.test.ts web/src/ui/workspaceLayout.test.ts`):
**5 failed, 20 passed** before the change, every failure at `code` being
`collapsed` instead of `open`:

- `defaultLayout()` opens Code and keeps secondary panels as rails, at every
  viewport before responsive recovery.
- `normaliseLayout` preserves explicit `collapsed` / `closed` Code choices.
- The workspace layout starts with `code: 'open'`.

Browser (`npx playwright test e2e/code-visible-default.spec.ts --grep 'fresh drawing'`):
**2 failed** (light and dark) at the intended assertion:

```text
Expected pattern: /code:open/
Received string:  "sidebar:collapsed,flows:collapsed,palette:collapsed,code:collapsed,props:collapsed"
```

A second defect surfaced while running the new narrow-screen scenario against the
first version of the fix: `recoverLayout` only ran on resize, so a fresh profile
at 680 px started with Code as a **modal drawer over the canvas**. The hook test
`starts a fresh profile on a narrow screen with Code as a rail` fails without the
initial-fit change and passes with it (verified by reverting that one line).

## Change

- `web/src/ui/uiLayout.ts`: `defaultLayout()` opens `code` beside the canvas;
  sidebar, flow steps, shapes and properties stay labelled rails. Explicit saved
  layouts are untouched — `normaliseLayout` keeps whatever mode the user left.
- `web/src/ui/useUiLayout.ts`: a fresh profile starts from the layout fitted to
  the viewport (`freshLayout`), so a narrow screen gets the same result as a
  resize: Code as an accessible rail, canvas usable, no drawer until asked for.
- Tests that assumed the old default now state the new contract explicitly
  (collapse Code first where the collapsed state is the subject), including
  `App.test.tsx`, `AppUx03.test.tsx`, `ux02-workspace.spec.ts`,
  `ux08-panels.spec.ts`, `ux03-files.spec.ts`, `s7-smoke.spec.ts`.
- `e2e/code-visible-default.spec.ts` (new): fresh drawing shows an editable,
  usable split; canvas edits reach the source within the debounce
  (measured, budget 350 ms for a 150 ms timer); undo/redo updates both surfaces;
  the drawn connection is a presentable Default flow with the message step and
  the launcher entry; code-to-canvas sync and diagnostics survive collapse and
  reopen; explicit collapsed/closed layouts survive reload and the controls
  reopen Code; wide, medium and narrow layouts keep a usable canvas, the narrow
  drawer is accessible (axe) and persists.

## Validation after the fix

```text
npx vitest run web/src/ui/uiLayout.test.ts web/src/ui/workspaceLayout.test.ts web/src/ui/App.test.tsx
  Test Files  3 passed (3)   Tests  54 passed (54)
npm test
  Test Files  168 passed (168)   Tests  1843 passed (1843)   (coverage thresholds green)
npm run check
  tsc + eslint clean
npx playwright test e2e/code-visible-default.spec.ts
  6 passed
npx playwright test            (full suite)
  298 passed (1.8m)
go vet ./...                   clean
staticcheck ./...              clean
gocyclo -over 15 cmd internal web   clean
go test -count=1 -race -cover ./...   ok (all packages)
```

Screenshot review (light and dark, `docs/STYLE-GUIDE.md` checklist):
`code-default-fresh-*`, `code-default-drawing-*`, `code-default-drawn-flow-*`,
`code-default-wide-*`, `code-default-medium-*`, `code-default-narrow-rail-*`,
`code-default-narrow-drawer-*`, `code-default-single-pane-light` under
`test-results/screenshots/`, plus an interactive Chrome review of the fresh shell
in both themes and after two quick-add shapes. Alignment, spacing, contrast and
theme parity hold; the canvas prompt “or type in the code view” is now true on a
fresh profile.

Follow-up recorded in `bugs.md` (outside this fix): quick-add places every new
shape at the canvas centre, so the second shape lands on top of the first and
must be moved before it can be connected.
