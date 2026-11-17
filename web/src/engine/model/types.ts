// SPDX-License-Identifier: GPL-3.0-only
// IR schema (M1-WP1) — language-neutral JSON contract shared TS⇄Go (SPEC §7).
// Normative shape: docs/FILE-FORMAT.md §7 + docs/milestones/M1.md decisions.
// Versioning rule: `irVersion` (int) bumps on any schema change; forward-only.

export const IR_VERSION = 12;
export const FORMAT_VERSION = '1.0';

/** 1-based source position attached to every statement (FILE-FORMAT §10). */
export interface Pos {
  line: number;
  col: number;
}

/** Leading comment lines (without the leading `#`) attached to a statement. */
export type Comments = string[];

export type Kind =
  | 'person'
  | 'system'
  | 'system_ext'
  | 'container'
  | 'component'
  | 'datastore'
  | 'queue'
  | 'group'
  | 'note';

export type Level = 'context' | 'container' | 'component' | 'deployment';
export type Dir = 'LR' | 'TB' | 'RL' | 'BT';
export type Theme = 'light' | 'dark';

export interface ImportStmt {
  alias: string;
  path: string;
  comments?: Comments;
  pos: Pos;
}

/**
 * Document-scoped icon declaration (IR v9, `icon <id> { … }`): the portable
 * way to carry a project icon inside the file itself. The payload is canonical
 * Base64 of the *sanitized* asset, and the media type is explicit so a reader
 * never has to guess. Declared handles are referenced by the existing object
 * `icon name` property, which resolves document icons first and falls back to
 * the built-in set (docs/FILE-FORMAT.md §3.1).
 */
export interface IconDecl {
  id: string;
  /** Human label for the picker; absent = the handle is shown as-is. */
  label?: string;
  /** Explicit media type. v1 accepts `image/svg+xml` only (FILE-FORMAT §3.1). */
  mediaType: string;
  /** Canonical Base64 (standard alphabet, padding, no whitespace). */
  data: string;
  comments?: Comments;
  pos: Pos;
}

/** Unknown-but-parseable attribute kept as raw data (FILE-FORMAT §12). */
export interface RawAttr {
  raw: string;
  pos: Pos;
  comments?: Comments;
}

export interface Property {
  key: string;
  value: string;
}

/**
 * Style block (§7.3). Link blocks additionally carry the arrow visual model
 * (F-12): `head`/`tail` marker shapes, `line` texture and `width`.
 */
export interface StyleBlock {
  fill?: string;
  stroke?: string;
  text?: string;
  icon?: string;
  shape?: string;
  dashed?: boolean;
  /** Link arrow-head marker (F-12). */
  head?: string;
  /** Link arrow-tail marker (F-12). */
  tail?: string;
  /** Link line texture: solid | dashed | dotted (F-12). */
  line?: string;
  /** Link geometry: orthogonal (default) | straight | curved. */
  route?: 'orthogonal' | 'straight' | 'curved';
  /** Link stroke width in document units (F-12). */
  width?: number;
  /** Playback spark count 1..8; absent = the historical single token (FLOW-02, IR v7). */
  sparks?: number;
  /** Playback spark speed multiplier 0.25..4 where 1 = default (FLOW-02, IR v7). */
  speed?: number;
  raw?: RawAttr[];
}

/** Explicit canvas geometry in document units (F-13, `size <w> <h>`). */
export interface Size {
  w: number;
  h: number;
}

/**
 * C4 decomposition relation (IR v12, docs/FILE-FORMAT.md §3.2). Authored on
 * the parent only — the child never declares a backlink — so an edge has one
 * source of truth. The discriminant makes a linked relation and an embedded
 * child mutually exclusive values; an embedded child always carries its own
 * recursive document, never an optional `doc` that might be missing.
 */
export type Drilldown = LinkedDrilldown | EmbeddedDrilldown;

/** `drilldown "path.pcd"`: the child stays a separate workspace file. */
export interface LinkedDrilldown {
  kind: 'linked';
  /** Workspace-relative POSIX path exactly as authored. */
  path: string;
}

/**
 * `drilldown embedded "logical/path.pcd" { pcd 1.0 … }`: the child's full
 * document travels inside the parent. `path` is the stable logical workspace
 * path used for identity, nested resolution and export diagnostics.
 */
export interface EmbeddedDrilldown {
  kind: 'embedded';
  path: string;
  doc: Doc;
}

/**
 * Embedded source (IR v10, `source { language "…" text "…" … }`): text the
 * document owns. One entry per source line — never re-derived by splitting, so a
 * trailing newline or an embedded blank line survives a round-trip (§3.3).
 */
export interface SourceBlock {
  /** Free-form language label; absent = unlabelled. */
  language?: string;
  /** Source lines in document order (at least one; the parser requires it). */
  lines: string[];
}

export interface Obj {
  kind: Kind;
  id: string;
  name?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  properties?: Property[];
  contains?: string[];
  attach?: string;
  icon?: string;
  /** Explicit size; absent = the kind's default shape (F-13). */
  size?: Size;
  /** Optional integer stacking override; absent = auto/effective z=0 (CX-03, IR v6). */
  z?: number;
  /** C4 decomposition target (IR v10, §3.2); absent = a leaf element. */
  drilldown?: Drilldown;
  /** Embedded source text (IR v10, §3.3); absent = none. */
  source?: SourceBlock;
  style?: StyleBlock;
  attributes?: RawAttr[];
  comments?: Comments;
  pos: Pos;
}

export interface Link {
  id?: string;
  from: string;
  to: string;
  type?: string;
  label?: string;
  bidir?: boolean;
  tags?: string[];
  style?: StyleBlock;
  waypoints?: [number, number][];
  /** Normalized side-quarter perimeter anchors; absent = automatic midpoint (CX-01). */
  fromAnchor?: number;
  toAnchor?: number;
  /** Opt out of best-effort object and connector avoidance (CX-02, IR v5). */
  allowOverlap?: boolean;
  attributes?: RawAttr[];
  comments?: Comments;
  pos: Pos;
}

interface StmtBase {
  comments?: Comments;
  pos: Pos;
}

/**
 * UX08-WP11 (IR v8): camera behaviour for one presentation step. `auto` is the
 * default when a step carries no camera at all; `hold` keeps the previous one;
 * `focus` names a canvas point and an optional zoom inside the 0.1–4 limits.
 */
export interface CameraSpec {
  mode: 'auto' | 'hold' | 'focus';
  /** focus only: canvas coordinates of the point to frame. */
  x?: number;
  y?: number;
  /** focus only: zoom factor, 0.1–4. */
  zoom?: number;
  /** Transition time in ms, 0–300; absent = the player default. */
  durationMs?: number;
}

/**
 * Flow-step metadata. Deliberately separate from `StmtBase`: camera and step
 * descriptions belong to flows, and a view line must never grow them.
 */
interface FlowStepBase extends StmtBase {
  /** Per-step dwell before auto-advance (F-18; overrides the beat default). */
  delayMs?: number;
  /** What this step shows, in one line of prose (UX08-WP11). */
  description?: string;
  /** Optional camera override for this step (UX08-WP11). */
  camera?: CameraSpec;
}

export interface Branch {
  label: string;
  steps: FlowStep[];
  comments?: Comments;
  pos: Pos;
}

export type FlowStep =
  | ({ type: 'intro'; text: string } & FlowStepBase)
  | ({ type: 'msg'; from: string; to: string; label?: string; linkRef?: string; flip?: boolean } & FlowStepBase)
  | ({ type: 'process'; target: string; text?: string } & FlowStepBase)
  | ({ type: 'alt'; label?: string; branches: Branch[] } & FlowStepBase)
  | ({ type: 'par'; label?: string; lanes: FlowStep[][] } & FlowStepBase)
  | ({ type: 'goto'; file?: string; flow: string; ret?: 'here' } & FlowStepBase)
  | ({ type: 'info'; text: string } & FlowStepBase)
  | ({ type: 'conclusion'; text: string } & FlowStepBase);

export interface Flow {
  id?: string;
  title?: string;
  /** One-line summary shown before the flow runs (UX08-WP11). */
  description?: string;
  steps: FlowStep[];
  comments?: Comments;
  pos: Pos;
}

/** One saved object position in top-level layout state (`position id (x, y)`). */
export interface LayoutPos {
  id: string;
  x: number;
  y: number;
}

/**
 * Top-level diagram layout state (ADR 0007, IR v11). Named views were removed;
 * the concepts they carried are promoted to one document-level object. Absent
 * means implicit auto layout with the document direction and no pins/hides.
 */
export interface LayoutState {
  /** Explicit layout directive; absent = auto layout with the document direction. */
  directive?: { mode: 'auto'; dir: Dir } | { mode: 'saved' };
  /** Saved positions in authored order. */
  positions: LayoutPos[];
  /** ids excluded from automatic layout. */
  pins: string[];
  /** element-level hidden ids. */
  hidden: string[];
  /** hidden tags. */
  hiddenTags: string[];
  comments?: Comments;
  pos: Pos;
}

export interface StyleStmt {
  target: string;
  style: StyleBlock;
  comments?: Comments;
  pos: Pos;
}

export interface Doc {
  irVersion: number;
  formatVersion: string;
  title?: string;
  level?: Level;
  direction?: Dir;
  theme?: Theme;
  /** Comments preceding the first meta directive (canonical: after magic line). */
  comments?: Comments;
  imports: ImportStmt[];
  /** Document icon declarations in document order (IR v9). */
  icons: IconDecl[];
  objects: Obj[];
  links: Link[];
  flows: Flow[];
  /** Top-level layout state; absent = implicit auto layout (ADR 0007). */
  layout?: LayoutState;
  styles: StyleStmt[];
}
