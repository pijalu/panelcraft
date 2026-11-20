# ADR-0004: Dependency policy and the allowed set

- Status: Accepted
- Date: 2025-11-07
- Context: constraint "minimal external dependencies; stdlib first; libraries allowed
  when they remove extreme complexity"

## Policy

1. Default = platform standard library (browser or Go std). A dependency needs a
   written reason: complexity avoided, correctness risk reduced, spec compliance.
2. Runtime (ships to users) deps are held to a stricter bar than dev/build/test deps.
3. Every new dependency: ADR + license compatibility check (GPL-3.0-compatible:
   MIT/Apache-2.0/BSD) + bundle-size note. No transitive-surprise rule: lockfile diff
   reviewed in the same PR.
4. Re-evaluate at M7: anything replaceable by ~100 lines of owned code gets replaced.
5. **Self-containment (SPEC N7/N11)**: nothing may load from a CDN or any external
   origin at runtime — no webfonts, no icon-font/CDN assets, no remote scripts. All
   third-party code ships inside the bundle (vite-inlined) or inside the Go binary
   (`go:embed`). Build must succeed offline after one-time dependency fetch
   (lockfile + `go.sum` committed). CI enforces via asset-origin scan + network-blocked
   e2e.

## Approved runtime set (v1)

| Dependency | Why | Alternative rejected |
|---|---|---|
| preact (+ htm via jsx runtime) | UI chrome: panels, trees, dialogs — state wiring by hand would dominate complexity | vanilla custom vdom (slow, risky); react (heavier) |
| codemirror 6 (`codemirror`, `@codemirror/{state,view,language,commands,search}`) | code view: incremental parse, diagnostics gutters, performs on big files (FR-K1, M4-WP1). MIT. Used at M4: ~6 packages, tree-shaken bundle impact ≈ 300 kB min / ≈ 90 kB gzip (vite build evidence in M4.md) | textarea + highlighting lib (no gutter/diag model) |
| dagre | layered auto-layout (N1); hand-rolling Sugiyama = high-risk algorithm code | own Sugiyama (post-v1 candidate); ELK (wasm, heavy) |
| chromedp (Go) | headless render CLI via CDP; pure Go, no cgo | os/exec chrome --screenshot (no settle control) |
| go-git/v5 (Go) | embedded local Git objects, index and history; Apache-2.0. Uncompressed binary grew by 2,814,544 bytes (13,941,586 → 16,756,130) in the implementation comparison | system Git executable (breaks zero-install single binary); hand-written Git formats (high correctness risk) |
| fflate *(conditional)* | ZIP fallback **only** when `CompressionStream`/`DecompressionStream` unavailable (Safari <16.4); loaded lazily | always-on zip lib (violates stdlib-first) |

ZIP base path = `CompressionStream`/`DecompressionStream` + thin container code
(owned, unit-tested) — stdlib-first honored; fflate is the documented fallback, not
the default.

## Approved dev/test set

vite, typescript, eslint(+ts), vitest(+fake-indexeddb, jsdom),
@testing-library/preact, playwright(+pixelmatch), staticcheck, gocyclo/gocognit,
@axe-core/playwright (M7 a11y gate, N5 — MIT; test-only, zero bundle impact;
hand-auditing WCAG 2.1 AA rules across all dialogs/themes does not scale and
misses regressions).

## Explicit non-dependencies (v1)

React, state libs (redux/zustand), CSS frameworks (tailwind — hand-rolled design
tokens instead), chart/graph engines (cytoscape/x6), yaml libs (PDL parser is
hand-written), mermaid.js, **anything CDN-loaded** (scripts/webfonts/icon fonts),
Google Fonts / unpkg / jsdelivr or any external origin at runtime.
