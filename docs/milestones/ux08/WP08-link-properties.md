<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP08 — Open Properties for links

**Severity:** High — property discovery and keyboard equivalence

**Status:** Proposed  
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

Pending. Record original no-op reproduction, green checks and focus/screenshot evidence here.
