# ADR-0006: Document-scoped project icons

- Status: Accepted
- Date: 2026-02-14
- Context: object icons were built-in only; the offline-only rule (no runtime network calls, no CDN) and the portable-file goal; bugs.md item 15

## Context

`icon name` has always pointed at a built-in set that ships with the app. Teams
draw their own architecture with their own logos and internal glyphs, and asked
to keep them **in the diagram file**, so a `.pcd` stays self-contained: mail it,
commit it, render it with the CLI, and it looks the same. Three constraints shape
the answer:

1. **Nothing may be fetched.** No CDN, no icon font, no external file reference
   (the offline-only rule). Whatever we accept has to travel inside the document.
2. **Round-trip stability.** Whatever we accept must survive
   `parse → print → parse` byte for byte, and Go must produce the same IR.
3. **Untrusted input.** Icons arrive from pasted markup and downloaded files, so
   the reader must never execute or fetch anything the author embedded.

## Options considered

1. **Reference a sibling file** (`icon logo "logo.svg"`) — keeps the document
   small, but breaks the "one file is the diagram" property, adds a second
   import mechanism with its own path/permission rules, and gives ZIP round-trip
   a new class of missing-asset failures.
2. **Embed raster images** (PNG/WebP) — needs a decoder on both sides to validate
   and measure, and either way the payload is larger than the vector source. The
   Go side would need a decode path it does not otherwise have.
3. **Embed SVG source inline as canonical Base64, inside a declaration
   statement, with an explicit media type** — chosen. SVG is text, so the format
   can hold it in a PDL string; Base64 keeps it on one line so the printer has
   nothing to reformat; an explicit media type keeps the door open for rasters
   in a future major version without changing what today's readers see.

## Decision

A new top-level statement declares a document icon:

```
icon <handle> {
  label "Company mark"          ← optional, picker name
  media "image/svg+xml"         ← required; v1 accepts this one type only
  data "<canonical Base64>"     ← required; the sanitized SVG source
}
```

* **Handles** are PDL identifiers. The built-in namespace is **reserved**: a
  project icon may not reuse a built-in handle (validation `P207`), so `icon
  cloud` never means two different pictures in two files.
* **Declarations print after imports and before objects**, in document order, so
  the canonical section order stays readable and diffable.
* **Limits** (validation `P208`): 64 KiB decoded per icon, 256 KiB per document,
  64 declarations. Small enough to keep a drag-live editor honest, large enough
  for a detailed vector mark.
* **Payloads are checked, not trusted** (`P209`): the SVG goes through an
  element/attribute allowlist. The same rule table runs in the browser
  (`engine/format/iconSvg.ts`), in the CLI (`internal/ir/svg.go`) and is gated by
  a shared fixture, so the two engines cannot drift apart on what is safe.
* **Rendering embeds the payload as a `data:` URI** of its sanitized source. That
  is local bytes (never a fetch), and an SVG drawn as an image by the browser
  runs in static mode: no scripts, no external references, whatever the file
  claims.
* **Removal and rename are document operations**, not text surgery: renaming a
  handle rewrites every reference in one undoable step, and removing a used icon
  reports the usages and clears them only on explicit confirmation.

## Consequences

+ A `.pcd` — or a ZIP of them — is still the complete diagram; exports, the CLI
  renderer and the canvas agree without a side channel.
+ Base64 on one line means the canonical printer, the IR serializer and the Go
  port have nothing to normalise, so parity stays a byte comparison.
+ Media type is explicit and validated, so a future raster support is additive.
− Icon payloads make files larger; teams that care keep using built-ins.
− Mermaid cannot express a custom icon, so the export declares `icons` dropped
  (it already did for built-ins).
− Two allowlist implementations (TS + Go) are a permanent parity obligation,
  mitigated by the shared `testdata/icon-cases.json` fixture.
