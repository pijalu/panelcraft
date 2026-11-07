// SPDX-License-Identifier: GPL-3.0-only
// IR schema (M1-WP1) — language-neutral JSON contract shared TS⇄Go (SPEC §7).
// Normative shape: docs/FILE-FORMAT.md §7 + docs/milestones/M1.md decisions.
// Versioning rule: `irVersion` (int) bumps on any schema change; forward-only.

export const IR_VERSION = 2;
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
  /** Link stroke width in document units (F-12). */
  width?: number;
  raw?: RawAttr[];
}

/** Explicit canvas geometry in document units (F-13, `size <w> <h>`). */
export interface Size {
  w: number;
  h: number;
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
  attributes?: RawAttr[];
  comments?: Comments;
  pos: Pos;
}

interface StepBase {
  comments?: Comments;
  pos: Pos;
  /** Per-step dwell before auto-advance (F-18; overrides the beat default). */
  delayMs?: number;
}

export interface Branch {
  label: string;
  steps: FlowStep[];
  comments?: Comments;
  pos: Pos;
}

export type FlowStep =
  | ({ type: 'intro'; text: string } & StepBase)
  | ({ type: 'msg'; from: string; to: string; label?: string; linkRef?: string; flip?: boolean } & StepBase)
  | ({ type: 'process'; target: string; text?: string } & StepBase)
  | ({ type: 'alt'; label?: string; branches: Branch[] } & StepBase)
  | ({ type: 'par'; label?: string; lanes: FlowStep[][] } & StepBase)
  | ({ type: 'goto'; file?: string; flow: string; ret?: 'here' } & StepBase)
  | ({ type: 'info'; text: string } & StepBase)
  | ({ type: 'conclusion'; text: string } & StepBase);

export interface Flow {
  id?: string;
  title?: string;
  steps: FlowStep[];
  comments?: Comments;
  pos: Pos;
}

export type ViewLine =
  | ({ type: 'layout'; mode: 'auto'; dir: Dir } & StepBase)
  | ({ type: 'layout'; mode: 'saved' } & StepBase)
  | ({ type: 'hideTag'; id: string } & StepBase)
  | ({ type: 'hide'; id: string } & StepBase)
  | ({ type: 'position'; id: string; x: number; y: number } & StepBase)
  | ({ type: 'pin'; id: string } & StepBase);

export interface View {
  id?: string;
  name: string;
  lines: ViewLine[];
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
  objects: Obj[];
  links: Link[];
  flows: Flow[];
  views: View[];
  styles: StyleStmt[];
}
