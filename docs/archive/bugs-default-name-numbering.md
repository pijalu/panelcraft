# Default element names were numbered from one global counter

## Observed

New elements were labelled with a number taken from a counter shared by every
kind. In a document that already held a component, adding a person produced:

```pcd
component o1 "Component 1"
person o2 "Person 2"
```

"Person 1" was free, and the reader of the diagram has no reason to connect the
person's number with the component's. The number also jumped when the file
happened to carry high element ids: loading a document whose elements were `o5`
and `o6` made the next new element "… 6".

## Cause

`CanvasController.addObject` built the label from the id:

```ts
const name = s('{kind} {n}', { kind: labelFor(kind), n: seqOf(id, 'o') });
```

Ids come from one sequence for the whole file (`this.seq`, shared by objects and
links and re-baselined to the highest suffix on load), and the label inherited
that number. Ids and labels answer different questions: an id only has to be
unique inside the file, while the label is prose the reader sees next to the
shape.

## What changed

- `web/src/ui/CanvasController.ts` gained `firstFreeName(objects, kind, label)`,
  which scans the names of elements **of that kind** and returns the first free
  `"<Kind> <n>"`, counted from 1. A gap is reused ("Container 1" and
  "Container 3" → "Container 2"), and a renamed element that already holds the
  default name is respected so two elements never share a label.
- `addObject` uses it for the label and keeps `uniqueId` for the id, so ids stay
  stable and never collide with a loaded file.
- The now-unused `"{kind} {n}"` string entry was removed from the catalog.
- `docs/SPEC.md` FR-C3 states the rule: one press adds one element, and the label
  is the first free name for that kind, counted from 1, independent of other
  kinds and of the element ids.

## Evidence

- `web/src/ui/CanvasController.ids.test.ts` — 4 new tests: each kind numbers from
  1 independently; the first free number is used rather than the highest; a file
  with high ids (`o5`, `o6`) still names the new element "System 1"; a renamed
  element holding the default name pushes the next one to "Queue 2". Written
  before the fix and seen failing.
- `e2e/bugs-palette-add.spec.ts` — real Chromium: adding a container and then a
  component through the palette yields "Container 1" and "Component 1", with no
  "… 2" of either kind.
- Full suite green afterwards (1729 unit tests, 254 browser tests).

## Notes

The change is presentational: the printed documents keep one statement per
element and the ids unchanged, so files round-trip exactly as before. Only the
default label of a *newly created* element differs, and it is editable in the
properties panel as it always was.
