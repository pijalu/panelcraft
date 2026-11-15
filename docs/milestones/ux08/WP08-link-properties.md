<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP08 — Open Properties for links

**Severity:** High — property discovery and keyboard equivalence

**Status:** Implemented and verified (2026-11-15)  
**Requirement:** 5 — double-click on an element shows properties; clarified as a link defect  
**Depends on:** nothing  
**Branch:** `feat/ux08-link-properties`

## Single-task outcome

Double-clicking a link or pressing Enter on a selected link selects it, opens Properties and
focuses its first useful field. Preserve object double-click/F2 inline rename.

## Evidence and UX rationale

`CanvasController.ts:1093-1096` handles double-click only for objects and calls rename.
`CanvasController.ts:1264-1267` handles Enter only for focused objects. Jakob’s Law supports
familiar inspect gestures; keyboard and context-menu alternatives are required alongside pointer.

## Implementation steps

1. **RED:** add controller and Playwright tests proving link double-click/Enter currently does
   not open Properties. Include object rename as a non-regression assertion.
2. Add a narrow controller callback such as `onPropertiesRequest({ kind: 'link', id })`. Do not
   let the controller import Preact or the layout store.
3. In the app adapter, select the link, call `ui.openPanel('props')`, and after render focus the
   link Label input without selecting/removing its value. If Properties was floating/closed,
   restore it through the existing layout API.
4. Handle double-click on route geometry and Enter when exactly one link is selected. Do not
   trigger while typing in an input, textarea, select or editable code surface.
5. Add **Properties** to the link context menu with the same command path. Update the user guide’s
   gesture table and SPEC keyboard wording only to match actual behavior.

## Required checks

```bash
npx vitest run web/src/ui/CanvasController.test.ts web/src/ui/App.test.tsx web/src/ui/PropertiesPanel.test.tsx
npm run check
npm run build
npx playwright test e2e/p1-links.spec.ts e2e/p1-properties.spec.ts e2e/p1-rename.spec.ts e2e/doc01-context-menu.spec.ts
```

Add keyboard-only and closed-panel E2E paths. Capture the opened link inspector in both themes.

## Acceptance

- Double-click, Enter and context Properties reach the same visible link editor.
- Focus lands in the intended field and subsequent typing edits only that field.
- Object double-click/F2 rename and existing object selection behavior remain unchanged.
- Closed, collapsed, docked and floating Properties states recover predictably.

## Evidence

### RED

Before the change the controller had no link path at all — `onDblClick` called
`onRenameRequest` for objects only, and `Enter` was handled only for a roving focused
object — so three new controller tests failed while the two non-regression guards
(object double-click renames, typing in a field is ignored) already passed:

```
web/src/ui/CanvasController.test.ts
  FAIL double-clicking link geometry asks for its properties
    AssertionError: expected [] to deeply equal [ { kind: 'link', id: 'L1' } ]
  FAIL Enter opens properties when exactly one link is selected
    AssertionError: expected [] to deeply equal [ { kind: 'link', id: 'L1' } ]
  FAIL openProperties() serves the same path for the context menu
  Tests  3 failed | 56 passed (59)
```

### GREEN

```
npx vitest run                     Test Files 111 passed | Tests 1149 passed
npx playwright test                130 passed (48.1s)
npm run check                      tsc + tsc -p tsconfig.sw.json + eslint: clean
npm run build                      built in 115ms
go test ./...                      ok (cmd, internal/corpus, ir, pdl, server)
staticcheck ./...                  rc=0
gocyclo -over 15 cmd internal web  OK
bash scripts/check-docs.sh         OK — 9 docs, all links resolve, .pcd blocks valid
bash scripts/check-selfcontained.sh OK — no external-origin resource loads in web/dist
```

New coverage: `CanvasController.test.ts` (5 cases: link double-click, object rename,
Enter on one link, Enter not hijacking a field, `openProperties()` for the menu) and
`usePropertiesRequest.test.tsx` (4 cases: link request selects + focuses Label without
changing its value, object request focuses Name, focus retries once a reopened panel
renders its field, no request without a live controller).

E2E (`e2e/ux08-link-properties.spec.ts`, 5 cases): double-click on route geometry,
Enter on a selected link editing only that link's label, the context-menu entry, a
**fully closed** Properties panel coming back before it takes focus, and object
double-click still renaming in place after the inspector had focus.

### Screenshot review (light + dark)

`ux08-link-properties-{light,dark}` in `test-results/screenshots/`: the link inspector
opens with the Label field focused (visible focus ring) and typing appends to the
existing value instead of replacing it; the Head/Tail/Line/Route/Weight tiles keep
their check marks and labels in both themes, and nothing in the panel clips or
overlaps at the default dock width.

### Notes

- The controller only reports *what* to inspect (`onPropertiesRequest`) — it still
  imports neither Preact nor the layout store; the shell half lives in
  `usePropertiesRequest.ts` (select → `openPanel('props')` → focus, retrying once the
  panel has rendered).
- The context menu leads with **Properties**, enabled only for exactly one selected
  object or link, and calls the same `openProperties()` as Enter; the object rename
  gesture is untouched.
- `docs/USER-GUIDE.md` (canvas gestures + context-menu list) and `docs/SPEC.md` FR-C7
  now describe the shipped behaviour; the DOC-01 guide/menu parity test covers it.
