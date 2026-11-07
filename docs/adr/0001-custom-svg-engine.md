# ADR-0001: Custom SVG rendering engine (no mermaid.js in the editor)

- Status: Accepted
- Date: 2025-11-07
- Context: SPEC D2

## Context

IcePanel-class features — live WYSIWYG editing (drag, resize, inline link creation),
per-step flow animation with camera moves and dimming, tag fading, ghosted imported
objects — require imperative control over the scene graph and animation timeline.

## Options considered

1. **Render with mermaid.js** — faithful mermaid look, zero renderer code.
   Rejected: SVG output is opaque (no stable per-element handles), no editing
   interaction model, animation limited to CSS poking at generated markup; would
   force a "preview-only" mermaid pane and a second editor paradigm. Two paradigms
   = two bugs per feature.
2. **Adopt a graph library (Cytoscape.js / maxGraph / x6)** — faster start for
   pan/zoom/hit-testing. Rejected as core: heavyweight abstractions we'd fight
   (custom data model in, custom serialization out), styling/animation control
   still partial; library churn risk. (Kept as fallback if custom engine blows the
   N1 perf budget — decision point M2.)
3. **Custom SVG engine** — chosen.

## Decision

Build a framework-agnostic TypeScript SVG engine: scene-graph model → SVG DOM,
layers (edges/objects/overlay/animation), hit-testing, viewport transform, WAAPI/
CSS-driven animation. Preact renders UI chrome *around* the canvas, never inside it.

## Consequences

+ Full control of animation, dimming, ghosting, camera; no abstraction fights.
+ Engine packages are plain TS → fast unit tests, no DOM framework coupling.
− We own pan/zoom, hit-testing, edge routing quality (orthogonal routing is the
  hard 20%) — mitigated by dagre for auto-layout (ADR-0004) and perf budget N1.
− Milestone M2 grows; accepted consciously.
