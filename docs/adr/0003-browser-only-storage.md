# ADR-0003: Browser-only persistence model

- Status: Accepted
- Date: 2025-11-07
- Context: SPEC FR-S*, FR-H1, N7

## Context

Hard product constraint: **nothing server-side**. The app must survive reloads
(durable-enough local storage), support multi-file workspaces, and remain fully
functional on GitHub Pages *and* behind the Go binary with zero backend endpoints.

## Decision

* Persistence = **IndexedDB** (workspace blob + settings + snapshots), autosave
  debounced 800 ms; schema-versioned with forward-only migrations (FR-S5).
* Ephemeral mode (FR-S2) = in-memory only, explicit user opt-in, export reminders.
* Quota errors degrade to ephemeral + warning (FR-S3). Clear-all-data = typed
  confirmation (FR-S4).
* The Go server exposes **read-only static + optional read-only `/files/*`** —
  no write endpoints by design; write-path absence is the guarantee.

## Alternatives considered

* localStorage only — 5 MB cap, synchronous, no blobs; rejected for workspace ZIPs.
* File System Access API as primary — powerful but Chromium-only and permission
  prompts hurt first-run UX; deferred to backlog (SPEC §12) as an *optional* mirror.
* OPFS — blob-friendly but same origin-partitioning caveats; IDB is more portable.

## Consequences

+ Truly static hosting; privacy provable in E2E (network-blocked suite green).
− "Clear browser data" loses work ⇒ ZIP export reminders + snapshots (FR-W7) are
  product answers, not optional polish.
− IDB availability in private-mode Safari quirks ⇒ wrapper layer with in-memory
  fallback, unit-tested via fake-indexeddb.
