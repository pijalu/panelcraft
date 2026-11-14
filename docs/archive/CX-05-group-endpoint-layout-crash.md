# CX-05: group-endpoint links crash auto-layout

**Completed:** 2026-11-14

**Scope:** a document whose link endpoint is a `group` boundary must validate, lay out and
render instead of throwing inside dagre.

## Root cause

Groups are laid out as compound parents (`setParent`), and the adapter still forwarded every
link to dagre. Dagre cannot rank an edge that terminates at a compound parent, so it threw
`TypeError: Cannot set properties of undefined (setting 'rank')`. The failure was reachable
from both the canvas auto-layout path (`ViewBar`) and `panelcraft render`; validation never
complained because a group id is a valid link endpoint.

Found while building the CX-03 corpus seed. Re-running the same document with every `z`
removed reproduced the crash, so it predates stacking order.

## Implemented behaviour

- The dagre adapter collects compound parents and skips any edge that terminates at one.
  Entity edges still decide the ranks; the group keeps the position and size dagre derives
  from its members.
- A link that targets a group is still drawn: its endpoints resolve against the boundary's
  computed rectangle, so the connector remains visible and routable.
- Validation semantics are unchanged — the document stays valid and renderable.

## Format and compatibility

- No format, IR or corpus change. The rule is adapter-internal and documented in
  `docs/FILE-FORMAT.md` §7.2 (what shapes a link can be) and in the changelog.

## Executed plan and debugging record

1. **Contract decision:** reject-in-validation versus tolerate-and-skip. Skipping keeps
  existing valid documents renderable and needs no format/IR migration, so it was chosen.
2. **RED:** added `dagre.test.ts` "a link that touches a group boundary does not break
  layout (CX-05)" with a compound `tray` parent and both edges; it failed with the exact
  `TypeError: Cannot set properties of undefined (setting 'rank')` seen from the CLI.
3. **GREEN:** the adapter now builds a `compound` set from `n.parent` and skips those edges
  before dedupe/insertion; the 12-test file passed.
4. **Real CLI:** rebuilt `web/dist` and the binary, then rendered the previously crashing
  document; `validate` reports `0 errors, 0 warnings, 0 infos`, SVG/PNG are produced, and
  the dark PNG was inspected (boundary, Auto, Back and the boundary-anchored stub all draw).

## Focused and common validation

- `npx vitest run web/src/engine/layout/dagre.test.ts` — **12 tests passed**.
- `npm test` — full suite passed (see commit evidence).
- `npm run check`, `npm run build`, `npx playwright test` — passed.
- `go test ./...`, `go vet ./...`, `staticcheck ./...`, complexity gates — passed.

## Accessibility and visual review

No new UI surface. The rendered dark PNG was inspected: the group boundary encloses its
members, the entity link keeps its arrowhead and label placement, and the boundary-started
link draws a visible stub from the boundary edge to the occluded member centre rather than a
stray detached segment.

## Deliberate limitations

A boundary-endpoint link does not influence node ranks, so it may be partially covered by the
member it targets (a group cannot be a rank source). This is preferred over dropping the user's
link, and it is documented rather than hidden.
