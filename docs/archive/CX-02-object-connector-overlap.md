# CX-02: object and connector overlap

**Completed:** 2026-07-26

**Scope:** deterministic route avoidance for objects and committed connector polylines, plus an explicit per-link overlap override. Manual waypoints and unavoidable intersections remain explicit and honest.

## Implemented behaviour

- Routes use the existing orthogonal candidate/channel search, with candidates evaluated against non-group objects and earlier committed routes in stable document order.
- Object conflicts cost more than connector conflicts; remaining ties use route length and stable candidate order. Equal-cost alternatives are considered, so automatic routing can cross a connector when every detour around solid objects would be longer.
- Coincident aligned and non-aligned automatic links receive bounded alternative channels on both axes. Explicit perimeter anchors retain their outward stubs. Shared endpoints do not count as overlap; collinear shared stubs remain conflicts where avoidable.
- Candidate generation uses at most 48 channels per axis, obstacle rectangles plus the two endpoint rectangles, with capped search nodes. The router deterministically selects a minimum-conflict route if all candidates intersect unavoidable geometry.
- A selected link exposes **Allow overlap**. `allowOverlap` removes both object and connector avoidance and does not alter explicit waypoints. Ordinary links continue to avoid geometry; this is not a global switch.
- The mini-map uses the same committed controller polylines as the canvas, SVG/PNG export, and CLI renderer. It no longer draws unrelated centre-to-centre connector placeholders.
- Clear-route stability remains unchanged when a route has no conflict; existing routing diagnostics and direct routing for missing anchor positions remain intact.

## Format and compatibility

- PDL link blocks accept the true-only `allow overlap` field. Duplicate fields are diagnostics. Canonical output omits the absent/default field.
- IR version is **5**, with optional `Link.allowOverlap`. TypeScript and Go parse, print, serialize, and merge the field consistently.
- Mermaid export declares `overlap overrides` as dropped data.
- New corpus seed: `testdata/corpus/routing-overlap/`. Canonical and parity fixtures were regenerated using the repository generators, never hand-edited.

## Executed plan and debugging record

1. **RED, routing:** new `routeAvoidance.test.ts` initially failed on existing-route avoidance and the override (three failures). Existing routes were not supplied as obstacles, and the override still received solid-object obstacles. Added route obstacles and a genuinely obstacle-free override path.
2. **Shared-endpoint fix:** an orientation predicate treated perpendicular shared endpoints as collinear because it reused the shared point. Segment conflict detection now checks orientation against both existing segment endpoints.
3. **Coincident non-aligned links:** the first implementation moved the central channel but left shared endpoint legs. Added direct endpoint-channel candidates on both axes for automatic anchors. A regression test covers deterministic selection of the shorter valid channel.
4. **RED, format:** new `overlap.test.ts` initially failed because `allow overlap` remained a raw attribute and the IR stayed at version 4. Added the typed TypeScript/Go field, parser/printer support, duplicate diagnostics, serialization, merge, and workspace round-trip.
5. **Complexity fixes:** extracted `linkHasGeometry` and `OverlapField`; no lint exception was added.
6. **E2E adjustment:** selecting a route at its midpoint was occluded by the intentional blocker in post-reload and manual-waypoint states. Tests select at 10% of path length instead. This changes the test pointer target, not the application hit region.
7. **Fallback expectation:** the blocked fixture initially assumed L2 would repeat L1's detour. Inspection showed the correct direct route has fewer solid-object conflicts and is shorter. The test now asserts that deterministic direct fallback rather than an arbitrary matching detour.
8. **Final-review RED:** a new two-object regression exposed that candidate scoring only ran after a connector conflict, leaving a legacy detour through a second object. Candidate scoring now runs for either object or connector conflicts. This also exposed an old test whose supposed detour still crossed the obstacle with an endpoint leg; the strengthened assertion now requires the complete clear route, including both legs.

## Focused and common validation

Executed from the repository root after the final implementation and documentation changes:

- `npx vitest run web/src/engine/render/routeAvoidance.test.ts web/src/engine/render/router.test.ts web/src/engine/format/overlap.test.ts web/src/engine/format/format.test.ts web/src/engine/model/model.test.ts web/src/engine/format/parity.test.ts web/src/workspace/workspace.test.ts web/src/ui/PropertiesPanel.test.tsx` — **8 files, 105 tests passed**.
- `npm run check` — TypeScript and ESLint passed.
- `npm test` — **95 files, 1003 tests passed**; all coverage thresholds passed.
- `npm run build` — production bundle rebuilt before E2E and CLI rendering.
- `npx playwright test` — **95 tests passed**, including both CX-02 light/dark journeys.
- `go vet ./...` — passed.
- `staticcheck ./...` — passed.
- `gocognit -over 15 .` — advisory nonzero only for vendored `node_modules/flatted`, existing Go tests, and Mermaid conversion helpers; no touched function was reported.
- `gocyclo -over 12 .` — advisory nonzero only for vendored `node_modules/flatted`, existing Go tests, Mermaid conversion, flow/style helpers, and the lexer; no touched function was reported.
- `gocyclo -over 15 cmd internal web` — **mandatory gate passed**.
- `go test -count=1 -race -cover ./...` — all packages passed; corpus parity and router coverage passed.
- `bash scripts/check-docs.sh` — 9 Markdown documents checked, links and PCD fences valid.
- `bash scripts/check-selfcontained.sh web/dist` — passed; no external runtime assets.
- `git diff --check` — passed.

The advisory complexity scans are not represented as clean. The mandatory complexity gate and all correctness gates are clean.

## Real CLI inspection

Built the actual binary with `go build -o /tmp/panelcraft-cx02 ./cmd/panelcraft`, then:

- `/tmp/panelcraft-cx02 validate /tmp/cx02-cli.pcd` — `0 errors, 1 warnings`; the warning is the intentionally unlinked `blocker` (`P201`).
- `/tmp/panelcraft-cx02 convert /tmp/cx02-cli.pcd -o /tmp/cx02-converted.pcd` — `allow overlap` preserved.
- Rendered SVG and PNG with the CLI. SVG paths:
  - L1: `M 200 130 L 200 192 L 520 192 L 520 130`
  - L2: `M 200 130 L 200 56 L 520 56 L 520 130`
  - L3: `M 200 130 L 520 130` (explicit override)
- `/tmp/cx02-cli.png` is a valid 1920×1080 PNG and was visually inspected.

## Accessibility and visual review

- Focused Playwright and full Chromium E2E passed, including axe WCAG 2.1 A/AA scans and SVG/PNG downloads.
- Reviewed `test-results/screenshots/cx02-{automatic,allowed,manual-waypoint,object-endpoint-edit,unavoidable}-{light,dark}.png` (10 captures).
- Automatic routing shows separated channels; the override and manual waypoint deliberately cross the blocker; the blocked fixture shows the documented direct fallback.
- The link inspector exposes **Allow overlap** without obscuring the waypoint controls.
- Light/dark connector strokes, labels, selection, mini-map routes, blocker outlines, and inspector text remain legible. No remaining contrast, clipping, overflow, or empty-state defect was found.

## Deliberate limitations

Dense routing remains best-effort: impossible geometry uses a deterministic minimum-conflict result rather than pretending intersections can always be removed. Explicit waypoints remain authoritative even when they cross an object. Groups themselves are not solid obstacles; their non-group children are. These semantics are documented in `docs/USER-GUIDE.md` and `docs/FILE-FORMAT.md`.
