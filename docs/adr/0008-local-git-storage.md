# ADR-0008: Embedded local Git workspace history

- Status: Accepted
- Date: 2026-11-20
- Context: local versioned file storage, single-binary distribution, and offline operation

## Context

The filesystem backend gives PanelCraft ordinary files and optimistic revisions but no durable
version history. The next backend must create local commits without weakening directory
confinement, static hosting, or the browser-only default. Calling a system Git executable would
add a runtime program dependency and make the single-binary contract depend on local installation.
Implementing Git objects, references, index handling, and tree reads directly would be unsafe and
far larger than the storage feature.

## Decision

* Use `github.com/go-git/go-git/v5`, licensed under Apache-2.0, as an embedded library. Its code
  ships in the Go binary; builds work offline after the committed module files are downloaded.
  No Git executable, remote operation, credential helper, or repository hook is used.
* Explicit `-storage-type git -local DIR` opens or initializes a standalone non-bare repository
  at exactly `DIR`. Parent discovery, linked-worktree `.git` files, and bare repositories are
  rejected. Commit identity comes from CLI options with PanelCraft-local defaults.
* Compose the existing confined filesystem store. Revisions combine HEAD and the content hash;
  each content commit stages the complete visible workspace plus PanelCraft metadata, so
  initializing Git around existing files cannot produce an incomplete restorable snapshot.
  Existing externally staged changes and merges in progress block mutation rather than risking
  an unrelated commit.
* Keep version history behind the optional version-store port. Restore reads commit objects and
  writes a new commit through normal filesystem reconciliation; it never resets or rewrites Git
  history. Static and non-Git storage have no version-history capability.
* Remote Git and GitHub integration remain separate future decisions.

## Alternatives considered

* **System Git via `os/exec`** — mature, but violates zero-install single-binary behavior and
  adds executable discovery, argument/environment, hook, and cross-platform process concerns.
* **Hand-written Git object/index code** — no additional library, but object formats, index
  semantics, corrupt repositories, and historical tree reads create unacceptable correctness risk.
* **Snapshots without Git** — simpler, but would not interoperate with ordinary local Git tooling
  and would not satisfy the requested Git backend.
* **Commit every autosave** — rejected because cursor, tab, and settings updates would flood
  history. Only versionable content changes create commits.

## Consequences

+ Users get local commits, history inspection, and non-destructive restore without network access
  or a separately installed Git executable.
+ Apache-2.0 is compatible with GPL-3.0-only distribution. Dependency and lockfile changes are
  reviewed together; binary-size impact is recorded in the dependency-policy ADR and
  implementation evidence.
− The embedded library increases binary and module-graph size. Linked worktrees and bare
  repositories are intentionally unsupported. Git does not preserve empty directories.
− A failed multi-file write or commit can still require recovery, and repository hooks are not
  run. External processes cannot be made transactional with the browser through Git alone.
