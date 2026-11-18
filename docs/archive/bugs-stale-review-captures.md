<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: the curated review captures showed a superseded user interface

## Observed

While reviewing the connector fixes, the four curated captures in `e2e/goldens/`
were opened as the visual record of the shipped application. They showed a shell
that no longer exists:

| Curated capture | Shipped application at the same revision |
|---|---|
| flat top bar of buttons: `Import…`, `Open ZIP`, `.pcd`, `.mmd`, `.svg`, `.png`, `ZIP`, `private`, `Snapshots`, `Clear data…`, `History` | a hamburger menu, the save indicator and a `Present` button |
| left strip labelled `0 Files` / `Flows` | a `FILES` panel plus a `flow steps` rail |
| tab name and close cross as loose text, no tab chrome | bordered, rounded tabs with the cross inside them |
| canvas without the dots grid, no minimap | dotted grid, minimap bottom-right |
| `PROPERTIES` header without its menu | `PROPERTIES` header with a kebab menu |

The image dimensions matched (1440 × 900), so the drift was invisible in a file
listing; the byte size was the only hint (`p6-minimap-light.png` grew from
68 643 to 126 943 bytes once the dot grid appeared).

## Cause

`e2e/lib/screenshots.ts` writes a curated golden **only** when
`UPDATE_GOLDENS=1`; a normal run writes to the gitignored `test-results/`
artifact directory and returns that path. No spec compares a golden against the
live render either — `capture()` takes a screenshot and hands back a path.

So nothing in CI can tell a fresh golden from a years-old one. The files were
last touched in `dd15906 fix(m7): keep mini-map clear of canvas targets`
(2026-11-11), and several shell changes landed afterwards without re-shooting
them. The refresh path was simply never triggered.

The consequence is a review gap rather than a runtime defect: the contributing
guide asks for a vision review pass against the captured screenshots, and a
reviewer comparing the application with these files sees the wrong application.
This round's own check needed the routing capture to confirm the arrowhead now
enters the entity, which the stale file could not show.

## Fix

1. Re-shot the curated set from the current build:

   ```
   UPDATE_GOLDENS=1 npx playwright test e2e/p6-minimap.spec.ts e2e/p6-routing.spec.ts
   ```

   All four files now show the shipped shell. `p6-routing-{light,dark}.png`
   additionally show the corrected curved connector (`submit request` entering
   the API box from the left, arrowhead pointing into the entity) and the
   de-collided `fallback` and `audit event` labels.

2. Recorded the missing trigger in `agents.md`: a change that moves the shell
   (top bar, panel rails, tab strip, canvas chrome) re-shoots the curated
   captures in the same change, because the vision review reads those files.

## Verification evidence

```
npx playwright test --workers=4 --reporter=line   → 234 passed
ls e2e/goldens                                   → 4 files, all re-captured
git diff --stat e2e/goldens                      → 4 files, dimensions unchanged
```

Review of the refreshed captures (light and dark): the dot grid is present, the
`FILES` panel and `flow steps` rail are in place, the active tab paints its own
border with the cross inside, the `Present` button and hamburger are visible,
the minimap thumbnail renders the diagram, and the dark pair differs from the
light pair only by design tokens.

## Residual risk

There is still no automated staleness gate. A file-modification-time check would
fire on every fresh clone, and comparing against a reference render is exactly
what these captures are not (they are curated for human review, never asserted).
The guard is the written rule plus the review step that already exists, so a
future shell change can drift again if that rule is skipped — the difference is
that the rule is now stated where the screenshot policy is read.
