<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued feature: presentable default flow from existing connections

Source: `bugs.md`, queued item 10. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §6.

## Observed behaviour

The default C4 context template ships Customer → Shop (`buys`) and Shop →
Payment provider (`charges`), yet presenting it required authoring a flow first.
Nothing was wrong with the ordering algorithm: `addFlow` already materialised
links in stable topological order (see
`docs/archive/bugs-topological-flow-editing.md`), but it only ran when the user
chose **New flow**. The missing piece was automatic availability for a link-only
document.

## Reproduction

Before the change, `e2e/flow01-canvas-flows.spec.ts`-style fixtures with links
but no authored flow showed the empty state (`flow-empty`) in the Flows pane and
`launcher-empty` in the presentation launcher, so the customer-journey story was
unreachable without writing PDL. The new spec `e2e/bug10-default-flow.spec.ts`
fails on the old code at its first assertion: `launcher-title-flow1` does not
exist.

## Design decision

The default flow is **virtual, not persisted**. Writing it into the file on open
would have violated the format contract in three ways: opening a diagram would
change it, repeated saves could append duplicates, and an authored flow could
later disagree with a snapshot nobody asked for.

- `web/src/ui/flows/derivedFlow.ts` is the single derivation: `derivedFlow(doc)`
  returns a `Flow` only when the document parses, has **no** authored flow and has
  at least one connection whose two endpoints exist. Steps come from
  `topologicalLinks()` — the same ordering `addFlow` uses, with creation order as
  the documented fallback for cycles — so parallel links stay distinct and
  labels are preserved.
- The derived flow reuses the id a `New flow` command would produce (`flow1`),
  which keeps the pane's selection valid across the edit that materialises it.
- `flowsForDisplay` (pane list) and `flowCatalog` (presentation launcher) add the
  derived entry; the launcher marks it "from the connections" so it is clear the
  walkthrough is inferred.
- `findFlow` resolves authored-then-derived, so playback works with no other
  change; `flowForEdit` materialises the derived flow inside the existing
  parse → mutate → print cycle, i.e. exactly one ordinary undoable command.
- Authored flows stay authoritative: as soon as one exists, nothing is derived.
  Empty documents and documents without usable connections keep the normal empty
  state.

## Implementation

| File | Change |
|---|---|
| `web/src/ui/flows/derivedFlow.ts` | new pure derivation, display list, key resolution, single materialisation |
| `web/src/ui/flows/flowCatalog.ts` | derived entry with a `derived` flag |
| `web/src/ui/flows/flowController.ts` | playback resolves derived keys |
| `web/src/ui/flows/FlowPane.tsx` | lists the derived flow, hint line, all edits materialise through `flowForEdit` |
| `web/src/ui/flows/PresentLauncher.tsx` | "from the connections" marker |
| `web/src/ui/strings.ts` | three new catalog strings |

## Verification

```
$ npm run check
> tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .
(no errors)

$ npm test
 Test Files  118 passed (118)
      Tests  1334 passed (1334)

$ npm run build && npx playwright test e2e/bug10-default-flow.spec.ts
  4 passed (2.8s)

$ npx playwright test
  168 passed, 1 failed — e2e/flow02-sparks.spec.ts (light), a pre-existing
  timing test that passes in isolation (2/2) and belongs to item 9's playback
  timing contract

$ npm run test:perf
      Tests  8 passed (8)

$ bash scripts/check-docs.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
```

The browser spec proves the four properties that matter: the launcher offers
"Default flow" and playback narrates `buys` then `charges`; presenting twice and
reloading never appends or duplicates a flow (the file text is compared
verbatim); the first edit writes exactly one flow block and undo returns to the
derived state; a link-less document keeps the empty state. The launcher
screenshot (`test-results/screenshots/item10-launcher-derived.png`) was reviewed
for hierarchy and wording.

## Residual risks

- A document with links to undefined shapes derives nothing (the step would point
  at a phantom). Those diagnostics remain the format validator's job.
- The materialised flow uses the generic title "Default flow"; it is editable
  like any other flow, and renaming it re-keys the selection through the existing
  rename path.
- `e2e/flow02-sparks.spec.ts` is timing sensitive under full parallel load; item
  9 owns the fix (one beat-lifetime contract plus deterministic timing tests).
