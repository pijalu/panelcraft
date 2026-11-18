# Creating a blank diagram is possible again

Closed. The template gallery offered three populated starting points and no way
to begin from nothing.

## Observed

- Creating a new file opened the template gallery; every card inserted a
  populated diagram (C4 context, a flow, or Mermaid import).
- There was no direct way to get a valid empty document and start placing shapes
  or writing code from an empty file.

## Expected

- New file creation offers a blank option beside the templates.
- Choosing blank creates a valid empty document, opens it as the active tab, and
  leaves the canvas ready for keyboard placement or code editing.
- The blank choice is keyboard accessible and does not leave the gallery covering
  the empty canvas.

## Cause

The overlay gate asked "does the snapshot have objects?". A blank document has no
objects, so a freshly created blank file looked identical to "nothing was ever
chosen" and the gallery could not be dismissed into an empty canvas. Blank had no
card either, because every card was a template with content.

## What changed

- `web/src/ui/EmptyState.tsx` offers a blank card first in the gallery with its
  own callback — blank means "insert nothing", not "insert sample text" — plus a
  blank constant (`BLANK_TEXT`) that seeds only the file header needed for a
  valid document.
- `web/src/ui/App.tsx` routes the blank action through the same new-file buffer
  the templates use (no second untitled file), and records the empty document as
  *authored*, so the gallery gate no longer reopens over it.
- `web/src/ui/useGalleryPrompt.ts` keeps the once-per-file prompt, so the blank
  path does not nag on every render.
- The overlay condition changed from "no objects in the snapshot" to "no authored
  content in this new file": a parsed file with only `pcd 1.0` is blank but
  authored, while a fresh buffer with no text is not.

## Evidence

- `web/src/ui/uxLaws.test.tsx` and the application tests cover the blank card,
  that it inserts no template content, and that the gallery closes on the new
  document.
- `e2e/bugs-blank-diagram.spec.ts` creates a blank file, keeps it active, asserts
  the canvas has no objects, places a shape with the keyboard, and captures light
  and dark screenshots of both the gallery and the opened blank canvas.
- `npm run check`, `npm test` and the Chromium spec pass; screenshots were
  reviewed against the style guide checklist.
