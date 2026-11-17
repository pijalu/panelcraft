<!-- SPDX-License-Identifier: GPL-3.0-only -->
# ADR 0007: remove named views; promote layout state to top level

Status: accepted. Supersedes the "retain Views" decision recorded in
`docs/archive/bugs-views-non-destructive.md` — that decision kept a feature that
kept causing resets. This ADR is the format decision behind the "Remove named
views without deleting diagram layout persistence" work item in `bugs.md`.

## Context

Named `view` blocks carried four independent things: an auto/saved layout mode,
saved object positions, pin/hide/fade filters, and a per-view session the UI
switched between. Only one view is ever active. Switching views recomputed
positions through automatic layout, producing unexplained drawing resets even
after the earlier non-destructive fix. The extra indirection buys nothing for
a single diagram and makes "where is the position source?" ambiguous.

The requirement is to remove the *named view* concept while keeping the layout
data. Deleting `Doc.views` without giving positions a new home would destroy
persistence, so the layout concepts are promoted to explicit top-level document
state rather than dropped.

## Decision

* The `view` statement is removed from the grammar. A top-level `view "..."` is
  a syntax error with diagnostic **E117** and a message naming the manual
  conversion. It is never silently ignored or auto-migrated.
* `drilldown "<path>" [view <id>]` becomes `drilldown "<path>"`. A `view` token
  after the path is a syntax error with diagnostic **E118**. The hierarchy
  validation that checked a view id against the target file is removed.
* The surviving single-view concepts move to one top-level `layout` block in
  the IR (field `layout`, type `LayoutState`) and to top-level PDL statements:

  ```
  layout auto <LR|TB|RL|BT>   |  layout saved
  position <id> (<x>, <y>)
  pin <id>
  hide <id>
  hide tag <tag>
  ```

  These accumulate into one state object; order among positions/pins/hides is
  document order. An absent `layout` means implicit auto layout with the
  document direction, matching the old implicit default view.
* Pin and hide survive because they are document display state, not view
  identity; their UI moves out of the removed view bar into the existing
  properties panel and application menu. Nothing is dropped beyond naming.
* IR version bumps 10 → 11. TypeScript and Go schemas, parser, printer,
  serializer, validation and the shared corpus/parity fixtures change in one
  atomic commit.

## Commands

* **Reset route** (exactly one selected link) and **Reset all routes** (no
  selection) clear waypoints and both endpoint anchors. Object, mixed and
  multi-link selections disable route reset. One shared, pure selection policy
  drives enablement from both the canvas context menu and the application menu.
* **Reset diagram layout** clears all saved positions and writes a deterministic
  automatic layout in a single undoable command. It is distinct from
  **Reset workspace layout**, which only restores panel geometry.
* **Apply layout** remains the explicit command that computes and persists
  positions. Route operations never touch positions.

## Consequences

* A file using legacy views fails to parse with an actionable diagnostic; users
  convert by hand: move the view's `layout`/`position`/`pin`/`hide` lines to the
  top level and drop the `view { … }` wrapper.
* `pcdToState` reads positions from `doc.layout.positions`; there is no view
  lookup left. Route reset and layout reset are pure document operations with
  regression tests, so "reset routes keeps positions" is enforced.
* The view bar, its CSS, its strings, `useViewSession`, `viewName` prop threading
  and the CLI `--view` flag are removed.
