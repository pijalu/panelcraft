# ADR-0003: Local-first persistence with optional real-file backends

- Status: Accepted; revised 2026-11-20
- Original decision: 2025-11-07
- Context: workspace persistence, static hosting, self-containment, and local CLI serving

## Context

The original decision required every workspace to remain in IndexedDB and prohibited
server write endpoints. That gives static hosting a strong privacy and offline story,
but it does not serve users who want ordinary files in a chosen directory. A local Go
process and the browser File System Access API can both provide real files without
sending workspace content to a third party.

The product still requires fully static GitHub Pages hosting, an offline-capable shell,
no external runtime resources, and no silently different fallback between storage
systems. A writable local endpoint also needs a narrower security model than a general
network service.

## Decision

* The default persistence adapter remains **IndexedDB**, with workspace settings and
  snapshots, 800 ms autosave, schema versioning, and forward-only migrations. Static
  hosting never probes for a workspace API.
* `panelcraft serve -local DIR -storage-type filesystem` explicitly opts into a
  same-origin workspace API backed by ordinary UTF-8 files below `DIR`. `filestorage`
  is an accepted alias. Without `-local`, the Go server remains browser-storage-only
  apart from its existing read-only static and `/files/*` responses.
* Filesystem access is confined to a canonical root and optional depth limit.
  `.panelcraft/workspace.json` holds workspace state; `.git`, reserved metadata,
  binary/non-UTF-8 files, and non-regular files stay outside the document tree.
* Strong `ETag`/`If-Match` revisions provide optimistic concurrency. External changes
  become visible conflicts rather than silent overwrites. The API does not promise
  transactions across multiple files or multi-user collaboration.
* Writable serving requires a loopback listener. It is a local single-user capability,
  not an authenticated network storage service. API mutations require JSON where
  applicable, `If-Match`, and a non-simple request header; responses are not cached.
* Supporting browsers may offer **Open directory…** through the File System Access API.
  This is an explicit, secure-context choice: no picker or permission prompt happens on
  page load. A chosen handle is remembered in its own IndexedDB record (metadata only)
  and reused silently only while read/write permission is already granted; otherwise the
  browser fallback stays active and **Reconnect local folder…** requests permission from
  that click. Cancellation retains the current workspace, and leaving the folder is
  explicit.
* The browser-only backend order for a profile without a chosen folder is the origin
  private file system, then Web Storage `localStorage`, then legacy IndexedDB, then
  memory. Selection is data-aware: an existing non-empty workspace always wins over an
  empty preferred backend, which keeps upgrading from looking like data loss and keeps
  the previous release usable as a rollback. Nothing is migrated or copied between
  backends; a save failure stays a visible error and never switches the backend.
  Composing that policy lives in one selection module that depends on injected
  capabilities, so no adapter imports UI code and no component knows the chain.
* TypeScript storage implementations share the existing snapshot `StoragePort`. Go
  handlers and CLI composition depend on a small `storage.Store` port. Local Git history
  belongs to a separate optional version-store port, preserving interface segregation.
* Private mode remains in-memory and leaving it restores the previous persistent
  backend. Clear operations require typed confirmation and describe actual file deletion.
* `-storage-type git` composes the filesystem backend with an embedded local Git library.
  It opens or initializes a standalone non-bare repository at exactly `DIR`, commits
  workspace content changes, and provides history preview and forward-only restore.
  Externally staged paths and merges in progress block mutation. Detached HEAD works;
  bare and linked-worktree repositories do not. No hook or remote operation is performed.
* Remote Git, credentials, clone/fetch/push, and GitHub integration remain separate work.

## Alternatives considered

* **IndexedDB only** — no longer the default. Retained as the legacy compatibility
  backend: an existing IndexedDB workspace keeps working, but a new profile stores in the
  origin private file system first.
* **Server filesystem as an implicit default** — rejected: static hosts have no API,
  and probing one would add pointless requests and ambiguity. Explicit HTML capability
  advertisement selects the server adapter instead.
* **File System Access API as the primary store** — rejected because support and
  permission behavior vary. It is now implemented as an optional user-selected adapter.
* **localStorage only** — 5 MB cap, synchronous access, and poor blob support make it
  unsuitable for workspaces.
* **OPFS** — origin-partitioned and invisible to external tools, so it is the preferred
  browser-only backend rather than a replacement for chosen folders or server storage.
* **Remote Git now** — rejected for this change because credentials, network failures,
  non-fast-forward updates, and history policy need their own security and UX design.

## Consequences

+ Static hosting, direct-directory use, and default browser storage keep workspace data
  off third-party origins; network-blocked and no-API-request tests remain enforceable.
+ Real files work with external editors and local tooling, while stale-write detection
  prevents the browser from silently replacing a newer external revision.
+ The same workspace and autosave behavior runs across storage implementations without
  coupling UI code to HTTP, IndexedDB, directory handles, or Git. Git history adds local
  commits and non-destructive restore without changing the default storage behavior.
− Server-backed offline work requires the local server; the service worker must not
  substitute cached workspace API responses. Direct-directory handles must be chosen
  again after reload in this version.
− Real-file deletion is destructive, multi-file reconciliation is not transactional,
  and conflict resolution currently requires user action rather than automatic merging.
  Git can restore earlier committed content, but does not make filesystem writes atomic
  and does not preserve empty directories.
− Clearing browser data can still lose default IndexedDB work, so ZIP export and named
  snapshots remain important backup mechanisms.
