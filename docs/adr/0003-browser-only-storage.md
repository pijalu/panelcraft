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
* Supporting browsers may offer **Open local folder…** through the File System Access
  API. This is an explicit, secure-context, session-scoped choice. Cancellation retains
  the current workspace; unsupported browsers retain IndexedDB.
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

* **IndexedDB only** — retained as the default, but insufficient as the only option for
  users who need ordinary files and external tooling.
* **Server filesystem as an implicit default** — rejected: static hosts have no API,
  and probing one would add pointless requests and ambiguity. Explicit HTML capability
  advertisement selects the server adapter instead.
* **File System Access API as the primary store** — rejected because support and
  permission behavior vary. It is now implemented as an optional user-selected adapter.
* **localStorage only** — 5 MB cap, synchronous access, and poor blob support make it
  unsuitable for workspaces.
* **OPFS** — blob-friendly but origin-partitioned and does not provide ordinary files
  visible to external tools; IndexedDB is more portable for the default.
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
