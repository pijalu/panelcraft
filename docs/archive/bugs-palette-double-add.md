# One palette press added two elements

## Observed

A single click on a shape in the Shapes palette added **two** elements. With a
document that held no datastore, one click on the Data Store item produced:

```pcd
datastore o1 "Datastore 1"
datastore o2 "Datastore 2"
```

The two landed at different places — one where the pointer was, one at the
default position in the middle of the view.

## Cause

The palette button had two independent add paths for one physical press:

- `onPointerDown` (`web/src/ui/Palette.tsx`) began a drag. Its `pointerup`
  listener called `onDragDrop` unconditionally, so releasing reported a drop even
  when the pointer had not moved.
- The `click` that follows the same press called `onPlace`.

So a press that did not move was both a drop and a click, and both paths added.
The drag preview (`.pc-palette-ghost`) was also created for every press, so a
plain click flashed a ghost on its way through.

## What changed

`web/src/ui/Palette.tsx` now decides what the press was before it adds anything:

- The press records where it started. If the pointer never travels more than
  `DRAG_SLOP_PX` (4px) on either axis, the release is not a drop — the click
  handler places the single element at the default position.
- A press that did move reports the drop once, and arms a flag so the click event
  that follows the same press is ignored. The flag is cleared on the next
  pointer-down, so a drag that releases away from the button cannot swallow a
  later click.

## Evidence

- `web/src/ui/Palette.test.tsx` (new, 4 tests): a press without movement places
  once and reports no drop; a press that moves reports one drop and does not also
  place; a drag leaves no ghost and the next press places again; the keyboard path
  still places without any pointer event. Written before the fix and seen failing
  (`expected "vi.fn()" to not be called at all, but actually been called 1 times`).
- `e2e/bugs-palette-add.spec.ts` — a real Chromium click on the palette item, then
  the code view holds exactly one statement of that kind; a real mouse drag with
  intermediate moves adds exactly one at the drop point.
- `web/src/ui/App.test.tsx` — the drag-drop case now moves the pointer between
  down and up, because a release with no movement is a click by design.

## Notes

Quick-add keys (`1`…`9`) were never affected: they call the same `addObject` once
and go through no pointer path.
