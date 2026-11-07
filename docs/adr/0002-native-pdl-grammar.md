# ADR-0002: Native `.pcd` grammar (mermaid-inspired, not mermaid-compatible)

- Status: Accepted
- Date: 2025-11-07
- Context: SPEC D7, FR-M6

## Context

The format must express things mermaid cannot: flows with 8 step types (alt/par/
goto nesting), typed links, per-object properties, imports, saved views/positions,
style overrides. Product owner ruled: mermaid *compatibility* is not required;
grammar may be mermaid-*inspired*; import/export converters provide interop
(import: lossless on supported subset; export: declared feature drop).

## Options considered

1. **Mermaid + extension comment block** (`%% pcd:begin … %% pcd:end`) — keeps files
   renderable by mermaid tools. Rejected: two syntaxes in one file (line grammar +
   YAML-in-comments), fragile tooling story, escaped the "code view is the source of
   truth" goal — the extension block becomes a config dump, not readable source.
2. **YAML/JSON-native** — trivial parsing, but hostile as a *hand-edited* code view
   (noise-to-signal for diagrams; arrow semantics lost).
3. **Own line-oriented grammar, mermaid-flavored** — chosen: arrows/labels feel
   familiar, blocks (`flow`, `view`, `group`) model our semantics directly.

## Decision

PDL `pcd/1` as specified in docs/FILE-FORMAT.md: `pcd 1.0` magic header, typed
object statements, typed arrow links (`a -requests-> b : "label" as L1`), nested
flow blocks, view/position/style sections. Mermaid enters/leaves only via the
converters (import §8, export §9 of FILE-FORMAT.md).

## Consequences

+ One coherent syntax; flows/views/imports are first-class and readable.
+ Round-trip and canonical printing are fully under our control (golden corpus).
− No free "renders anywhere" property; mitigated by the always-available lossy
  mermaid export (FR-M4) and PNG/SVG export.
− Converter fidelity is a permanent maintenance surface — bounded by documented
  mapping tables + diagnostics (FR-M5) and shared corpus tests.
