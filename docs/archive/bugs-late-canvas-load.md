# A late canvas load no longer overwrites what the user typed

Closed. Found while running the full suite for the flow-panel refactor.

## Observed

`e2e/step-properties.spec.ts` failed at its seeding step: after typing a document
into the code view the sync chip went `editing` → `error` and never recovered.
The same shape of failure appeared in one full run as
`e2e/round3-browser-fixes.spec.ts` and in another as
`e2e/bug07-menu-viewport.spec.ts`, so it was not one spec's problem. It never
reproduced in isolation: 36/36 seeds of the same document were clean when the
spec ran alone, and 12 repeats at four workers passed too.

```text
Error: expect(locator).toHaveAttribute(expected) failed
Locator:  getByTestId('sync-state')
Expected: "clean"
Received: "error"
  - 5 × locator resolved to ... data-sync-state="editing"
  - 9 × locator resolved to ... data-sync-state="error"
 at seedDoc (e2e/step-properties.spec.ts:66)
```

## Cause

The canvas loading the open file is reported to the shell as a canvas snapshot.
The code bridge (`useCodeSync`) treats every such emission as a canvas *edit* and
merges it into the code buffer. On a slow start that emission can land after the
user has already typed a different document. `applyCanvasState` takes the
canvas's entities and keeps the buffer's flows/views/styles, so the merged
document is the file's entities plus the typed document's flow steps — steps
whose participants no longer exist. That document does not parse, and the machine
stays in `error` because nothing ever replaces the buffer again.

Proof at the machine level, without the browser: typing document A and then
delivering the canvas state of document B (the standard "canvas loaded the file"
emission) replaced A with B's entities (`useCodeSync.test.tsx`, test
`a late load emission does not corrupt a document the user typed`).

A second, smaller gate was added on the way: the code view reported `clean` while
the machine was still empty, so a seed (or a fast typist) could select-all and
type into a buffer that had no file in it yet. Measured with a probe — the chip
read `clean:0` (zero characters in the editor) on 3 of 5 fresh loads before the
file text arrived.

## Fix

- The bridge records the projection the canvas will emit for the file it is
  loading (`projectionOf(text)`) and recognises that emission as a load, not an
  edit. The check is by content, so it does not matter which of the two loads
  wins the race. A load echo still marks the file as saved.
- `useCodeSync` exposes `loaded` (true once the machine holds the open file's
  text, or immediately when there is no file to load). `CodePane` renders the
  editor only when `loaded`, and a muted `Loading the file…` line before that, so
  there is no window in which an empty buffer accepts typing.
- `echoKind()` and `mergeBase()` were extracted from the bridge effect to keep it
  inside the complexity budget (12) without suppressing the rule.

## Validation

- `web/src/ui/useCodeSync.test.tsx` — `a late load emission does not corrupt a
  document the user typed` fails before the fix (the buffer shows `system a "A"`
  instead of the typed document) and passes after; `a canvas edit still wins while
  the buffer parses` guards the other direction. Also
  `useCodeSync readiness` (loaded is false while the workspace starts, true once
  the text is in, true with no file) and `report loaded for a workspace with no
  open file`.
- `web/src/ui/CodePane.test.tsx` — no editor before the file is loaded, editor
  after. Verified red by forcing the gate open (1 failed, 1 passed).
- `npx vitest run` — 1662 passed; `npm run check` clean.
- `npx playwright test` (4 workers, full suite) — 239 passed, twice, after the
  fix; the same suite produced a seed failure in each of the two runs before it.
