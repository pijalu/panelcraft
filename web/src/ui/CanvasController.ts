// SPDX-License-Identifier: GPL-3.0-only
// Canvas controller (M2-WP1/4/6 wiring): owns diagram state + viewport,
// translates pointer/wheel/keyboard input into mode state machines, commits
// mutations through the undo stack (FR-C1/C2/C4/C7/C9). DOM writes go to the
// SceneRenderer only; App reads snapshots via onState.

import {
  SceneRenderer,
  MARKER_SHAPES,
  type MarkerShape,
  type Scene,
  type SceneLink,
} from '../engine/render/scenegraph';
import { routeLink, portPoint, type Side, type Polyline } from '../engine/render/router';
import {
  invert,
  panBy,
  zoomAt,
  fitRect,
  unionRects,
  wheelGesture,
  actionFor,
  PAN_STEP_PX,
  ZOOM_STEP,
  type Point,
  type Rect,
  type Transform,
} from '../engine/render/viewport';
import { snapToGrid, computeGuides } from '../engine/render/snap';
import { resizedRectWithCues, type ResizeCandidate, type ResizeCue } from '../engine/render/resize';
import { projectPerimeter } from '../engine/render/perimeter';
import {
  alignObjects,
  copySelection,
  distributeObjects,
  equalSizeObjects,
  pasteClipboard,
  type AlignMode,
  type Clipboard,
  type DistributeAxis,
} from './canvasCommands';
import {
  autoSize, canvasMeasurer, PADDING, WRAP_AT, wrapLabel, type TextMeasurer,
} from '../engine/render/measure';
import { rightContentReserve } from '../engine/render/shapes';
import type { Guide } from '../engine/render/snap';
import { pick } from '../engine/render/hit-test';
import {
  clearOverlay,
  drawRubberBand,
  drawGuides,
  drawGhostLink,
  drawHalos,
  drawResizeHandle,
  drawResizeCues,
  drawEndpointHandles,
  drawWaypointHandles,
  type HaloSide,
  type ResizeHandle,
} from '../engine/render/overlay';
import { ValueChange, UndoStack, type CoalescableCommand } from '../workspace/undo';
import type { Kind } from '../engine/model/types';
import { s, type StringKey } from './strings';

export interface DiagramObject {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Explicit size written to the file (`size <w> <h>`, F-13); absent = default. */
  size?: { w: number; h: number };
  /** Pre-wrapped label (F-13); transient canvas state, never persisted. */
  lines?: string[];
  /** Custom key-value properties (F-11). */
  properties?: { key: string; value: string }[];
  /** Style overrides written into the object's style block (F-11). */
  style?: { fill?: string; stroke?: string; text?: string; icon?: string };
  name?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  dashed?: boolean;
  icon?: string;
}

export interface DiagramLink {
  id: string;
  from: string;
  to: string;
  /** Arrow type; absent = untyped arrow (F-08: the canvas never invents one). */
  type?: string;
  label?: string;
  dashed?: boolean;
  /** `<->` double-headed link (F-07). */
  bidir?: boolean;
  /** Explicit routing waypoints (F-19). */
  waypoints?: [number, number][];
  /** Normalized perimeter endpoint anchors (CX-01, IR v4). */
  fromAnchor?: number;
  toAnchor?: number;
  /** Arrow visual model (F-12). */
  head?: string;
  tail?: string;
  line?: string;
  route?: 'orthogonal' | 'straight' | 'curved';
  width?: number;
}

export interface DiagramState {
  objects: DiagramObject[];
  links: DiagramLink[];
}

export const DEFAULT_SHAPE: Record<Kind, { w: number; h: number }> = {
  person: { w: 120, h: 72 },
  system: { w: 160, h: 60 },
  system_ext: { w: 160, h: 60 },
  container: { w: 160, h: 60 },
  component: { w: 160, h: 60 },
  datastore: { w: 140, h: 64 },
  queue: { w: 140, h: 60 },
  group: { w: 320, h: 240 },
  note: { w: 160, h: 88 },
};

export const PALETTE_ORDER: Kind[] = [
  'person',
  'system',
  'system_ext',
  'container',
  'component',
  'datastore',
  'queue',
  'group',
  'note',
];

/** F-13: every kind resizes (min 48×32, grid-snapped, one undo per drag). */
export const MIN_SIZE = { w: 48, h: 32 };
const DRAG_THRESHOLD = 2;
const objectIcon = (o: DiagramObject): string | undefined => o.style?.icon ?? o.icon;

function explicitLines(o: DiagramObject, text: string, measure: TextMeasurer, width = o.w): string[] {
  const reserve = rightContentReserve(o.kind, objectIcon(o));
  const available = Math.max(24, Math.min(WRAP_AT, width - 2 * PADDING.x - reserve));
  return wrapLabel(text, measure, available, Number.POSITIVE_INFINITY);
}

type Mode =
  | { t: 'idle' }
  | { t: 'pan'; startScreen: Point; startT: Transform }
  | { t: 'drag'; startCanvas: Point; before: PositionRec[]; moved: boolean }
  | { t: 'band'; startCanvas: Point; additive: boolean }
  | { t: 'link'; fromId: string; fromSide: Side }
  | { t: 'resize'; id: string; handle: ResizeHandle; startCanvas: Point; before: Rect; original: DiagramObject }
  | { t: 'endpoint'; linkId: string; end: 'from' | 'to'; before: Pick<DiagramLink, 'fromAnchor' | 'toAnchor'> }
  | { t: 'waypoint'; linkId: string; index: number; before: [number, number][] };

interface PositionRec {
  id: string;
  x: number;
  y: number;
}

export interface Snapshot {
  objects: DiagramObject[];
  links: DiagramLink[];
  selection: { objects: string[]; links: string[] };
  viewport: Transform;
}

export interface ControllerOptions {
  undo?: UndoStack;
  onState?: (s: Snapshot) => void;
  onRenameRequest?: (id: string) => void;
  /** F-20: open the file an imported (ghost) object came from. */
  onGhostOpen?: (path: string) => void;
  /** Text measurement port (F-13); defaults to an offscreen canvas in a DOM. */
  measure?: TextMeasurer;
  /**
   * Geometry commit hook (F-14): called at the end of a drag/resize with the
   * positions that actually changed. The consumer persists them into the
   * active view (debounced) — the canvas never writes the file itself.
   */
  onGeometry?: (positions: Record<string, { x: number; y: number }>) => void;
  /** F-24: unified history feed (canvas commands, one row per user action). */
  onHistory?: (label: string, mergeKey?: string) => void;
  /** F-25: hover info card data (null = nothing hovered). */
  onHover?: (info: import('./hoverInfo').HoverInfo | null) => void;
}

const KIND_LABELS = {
  person: 'Person',
  system: 'System',
  system_ext: 'System Ext',
  container: 'Container',
  component: 'Component',
  datastore: 'Datastore',
  queue: 'Queue',
  group: 'Group',
  note: 'Note',
} as const satisfies Record<Kind, StringKey>;

export function labelFor(kind: Kind): string {
  return s(KIND_LABELS[kind]);
}

/** Numeric suffix of a generated id (`o12` → 12); 0 when it is not one. */
function seqOf(id: string, prefix: 'o' | 'l'): number {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
  return m ? Number(m[1]) : 0;
}

/**
 * F-02: ids must be stable and never reuse an id that already exists in the
 * loaded file (a duplicate id printed twice loses one entity on reload).
 * Returns `prefix<n>` starting at `from` that no id in `taken` uses.
 */
export function uniqueId(taken: ReadonlySet<string>, prefix: 'o' | 'l', from: number): string {
  let n = Math.max(from, 1);
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function rectOf(o: Rect): Rect {
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function resizeCandidate(o: DiagramObject): ResizeCandidate {
  return { id: o.id, label: o.name || o.id, rect: rectOf(o) };
}

function resizeStatus(cues: ResizeCue[]): string {
  return cues.map((cue) => s(
    cue.dimension === 'width'
      ? 'Equal width with {label} ({value})'
      : 'Equal height with {label} ({value})',
    { label: cue.candidate.label ?? cue.candidate.id, value: cue.value },
  )).join('; ');
}

function normRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function listEq<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function haloTarget(e: Event): { id: string; side: HaloSide } | null {
  const el = (e.target as Element | null)?.closest('.pc-halo');
  if (!el) return null;
  const id = el.getAttribute('data-id');
  const side = el.getAttribute('data-side') as HaloSide | null;
  return id && side ? { id, side } : null;
}

/** F-19: the waypoint handle under the pointer, if any. */
/** Arrow key → navigation direction (modifier keys opt out). */
function arrowDirection(
  key: string,
  mod: boolean,
): 'left' | 'right' | 'up' | 'down' | null {
  if (mod) return null;
  const dirs: Record<string, 'left' | 'right' | 'up' | 'down'> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  };
  return dirs[key] ?? null;
}

function endpointTarget(e: Event): { linkId: string; end: 'from' | 'to' } | null {
  const el = (e.target as Element | null)?.closest('.pc-endpoint');
  const linkId = el?.getAttribute('data-link');
  const end = el?.getAttribute('data-end');
  return linkId && (end === 'from' || end === 'to') ? { linkId, end } : null;
}

function waypointTarget(e: Event): { linkId: string; index: number } | null {
  const el = (e.target as Element | null)?.closest('.pc-waypoint');
  const linkId = el?.getAttribute('data-link');
  const index = el?.getAttribute('data-wp-index');
  return linkId && index !== null && index !== undefined
    ? { linkId, index: Number(index) }
    : null;
}

function resizeTarget(e: Event): { id: string; handle: ResizeHandle } | null {
  const el = (e.target as Element | null)?.closest('.pc-resize-handle');
  const id = el?.getAttribute('data-id');
  const handle = el?.getAttribute('data-handle') as ResizeHandle | null;
  return id && handle ? { id, handle } : null;
}

export class CanvasController {
  readonly undo: UndoStack;
  private readonly svg: SVGSVGElement;
  private readonly renderer: SceneRenderer;
  private state: DiagramState = { objects: [], links: [] };
  private t: Transform = { x: 0, y: 0, k: 1 };
  private mode: Mode = { t: 'idle' };
  private selObjects = new Set<string>();
  private selLinks = new Set<string>();
  private gridOn = false;
  private spaceDown = false;
  private routes = new Map<string, Polyline>();
  private seq = 0;
  /** Set by loadState: the canvas only speaks for a file after it has one
   * (F-28 — a pre-load empty snapshot must not be mistaken for a canvas edit). */
  private hydrated = false;
  private readonly onState?: (s: Snapshot) => void;
  private readonly onRenameRequest?: (id: string) => void;
  private readonly measure: TextMeasurer;
  private readonly onGeometry?: (positions: Record<string, { x: number; y: number }>) => void;
  private readonly onHistory?: (label: string, mergeKey?: string) => void;
  private readonly onHover?: (info: import('./hoverInfo').HoverInfo | null) => void;
  private readonly onGhostOpen?: (path: string) => void;
  /** F-20: read-only imported objects (never part of `state`). */
  private ghosts: Array<DiagramObject & { path: string }> = [];
  /** F-22: roving focus (keyboard navigation across scene objects). */
  private focusId: string | null = null;
  /** F-25: hovered object id (info card) — null when nothing is hovered. */
  private hoverId: string | null = null;
  /** F-23: objects whose statement currently has a parse error. */
  private errorIds = new Set<string>();
  private detach: Array<() => void> = [];

  constructor(svg: SVGSVGElement, opts: ControllerOptions = {}) {
    this.svg = svg;
    this.undo = opts.undo ?? new UndoStack();
    this.onState = opts.onState;
    this.onRenameRequest = opts.onRenameRequest;
    this.measure = opts.measure ?? canvasMeasurer();
    this.onGeometry = opts.onGeometry;
    this.onHistory = opts.onHistory;
    this.onHover = opts.onHover;
    this.undo.setObserver((cmd) => this.onHistory?.(cmd.label, cmd.coalesceKey));
    this.onGhostOpen = opts.onGhostOpen;
    this.renderer = new SceneRenderer(svg);
    this.attach();
    this.render();
  }

  destroy(): void {
    for (const d of this.detach) d();
    this.detach = [];
  }

  // ---- public API (App / palette / properties panel) -----------------------

  get viewport(): Transform {
    return this.t;
  }

  get snapshot(): Snapshot {
    return {
      objects: this.state.objects,
      links: this.state.links,
      selection: { objects: [...this.selObjects], links: [...this.selLinks] },
      viewport: this.t,
    };
  }

  selectedObject(): DiagramObject | null {
    if (this.selObjects.size !== 1) return null;
    const id = [...this.selObjects][0];
    return this.state.objects.find((o) => o.id === id) ?? null;
  }

  selectedLink(): DiagramLink | null {
    if (this.selLinks.size !== 1) return null;
    const id = [...this.selLinks][0];
    return this.state.links.find((l) => l.id === id) ?? null;
  }

  /** Place a new object centered at `at` (palette drop / click / quick-add). */
  addObject(kind: Kind, at?: Point): string {
    const size = DEFAULT_SHAPE[kind];
    const p = at ?? this.centerOfView();
    const x = at ? Math.round(p.x - size.w / 2) : snapToGrid(p.x - size.w / 2);
    const y = at ? Math.round(p.y - size.h / 2) : snapToGrid(p.y - size.h / 2);
    // F-02: probe for a free id — never reuse an id loaded from the file
    const id = uniqueId(this.takenObjectIds(), 'o', ++this.seq);
    this.seq = Math.max(this.seq, seqOf(id, 'o'));
    const name = s('{kind} {n}', { kind: labelFor(kind), n: seqOf(id, 'o') });
    // F-13 fit-to-name on create: the default box is a fallback, the label wins
    const fit = autoSize({ text: name, kind }, this.measure);
    const obj: DiagramObject = {
      id, kind, x, y, w: Math.max(size.w, fit.w), h: Math.max(size.h, fit.h), name, lines: fit.lines,
    };
    const before = this.state.objects;
    this.state = { ...this.state, objects: [...before, obj] };
    this.selectObjects([id]);
    this.undo.push(this.addRemoveCommand(obj, before));
    this.render();
    return id;
  }

  /** Fit an object to its label unless it carries explicit geometry (F-13). */
  private fitted(o: DiagramObject): DiagramObject {
    const text = o.name && o.name.length > 0 ? o.name : o.id;
    if (o.size !== undefined) return { ...o, lines: explicitLines(o, text, this.measure) };
    const fit = autoSize({ text, kind: o.kind, icon: objectIcon(o) }, this.measure);
    // grow-only: a short label keeps the kind's default box, a long one gets
    // the room it needs (never shrink below what the shape language defines)
    return {
      ...o,
      w: Math.max(o.w, fit.w),
      h: Math.max(o.h, fit.h),
      lines: fit.lines,
    };
  }

  /** Apply a properties patch; label/icon changes refit unless size is explicit. */
  private patched(o: DiagramObject, patch: Partial<DiagramObject>): DiagramObject {
    const next = { ...o, ...patch };
    if (patch.name !== undefined || patch.style?.icon !== undefined) {
      const text = next.name && next.name.length > 0 ? next.name : o.id;
      const fit = autoSize({ text, kind: o.kind, icon: objectIcon(next) }, this.measure);
      next.lines = o.size === undefined ? fit.lines : explicitLines(next, text, this.measure);
      if (o.size === undefined) {
        // grow-only on rename too: a shorter name must not shrink the box the
        // user is looking at (shrinking is the explicit `Fit` command's job)
        next.w = Math.max(o.w, fit.w);
        next.h = Math.max(o.h, fit.h);
      }
    }
    return next;
  }

  /**
   * F-13 `Fit` command: size the selected objects to their labels and record
   * the result as explicit geometry (which then disables further auto-fit).
   */
  // ---- F-19: clipboard, alignment, distribution ------------------------------

  private clipboard: Clipboard | null = null;

  /** Copy the selection (objects + links fully inside it) — true when copied. */
  copySelected(): boolean {
    if (this.selObjects.size === 0) return false;
    this.clipboard = copySelection(this.state, this.selObjects, this.selLinks);
    return this.clipboard.objects.length > 0;
  }

  /** True when there is something to paste (for menu enablement). */
  canPaste(): boolean {
    return this.clipboard !== null && this.clipboard.objects.length > 0;
  }

  /** Paste the clipboard with fresh ids; selects and returns the new ids. */
  pasteCopied(offset = { x: 24, y: 24 }): string[] {
    if (this.clipboard === null) return [];
    const before = this.state;
    const res = pasteClipboard(this.state, this.clipboard, offset);
    if (res.objects.length === 0) return [];
    this.state = res.state;
    this.selectObjects(res.objects);
    this.undo.push({
      label: s('paste'),
      undo: () => this.applyState(before),
      redo: () => this.applyState(res.state),
      coalesce: () => null,
    });
    this.recomputeRoutes();
    this.render();
    return res.objects;
  }

  /** Copy + paste in one step (duplicate the selection in place). */
  duplicateSelected(): string[] {
    if (!this.copySelected()) return [];
    return this.pasteCopied();
  }

  /** Align the selection inside its own bounding box. */
  alignSelected(mode: AlignMode): void {
    this.mutateObjects((objects) => {
      const targets = objects.filter((o) => this.selObjects.has(o.id));
      if (targets.length < 2) return objects;
      const moved = new Map(alignObjects(targets, mode).map((o) => [o.id, o]));
      return objects.map((o) => moved.get(o.id) ?? o);
    }, s('align {mode}', { mode }));
  }

  /** Distribute the selection evenly (needs ≥3 objects). */
  distributeSelected(axis: DistributeAxis): void {
    this.mutateObjects((objects) => {
      const targets = objects.filter((o) => this.selObjects.has(o.id));
      if (targets.length < 3) return objects;
      const moved = new Map(distributeObjects(targets, axis).map((o) => [o.id, o]));
      return objects.map((o) => moved.get(o.id) ?? o);
    }, s('distribute {axis}', { axis }));
  }

  /** Give the selection one size (the largest). */
  equalSizeSelected(): void {
    this.mutateObjects((objects) => {
      const targets = objects.filter((o) => this.selObjects.has(o.id));
      if (targets.length < 2) return objects;
      const sized = new Map(equalSizeObjects(targets).map((o) => [o.id, o]));
      return objects.map((o) => sized.get(o.id) ?? o);
    }, s('equal size'));
  }

  /** Apply an object-list transform as one undoable command (no-op when equal). */
  private mutateObjects(fn: (objects: DiagramObject[]) => DiagramObject[], label: string): void {
    const before = this.state.objects;
    const after = fn(before);
    if (listEq(before, after)) return;
    this.state = { ...this.state, objects: after };
    this.undo.push(
      new ValueChange<DiagramObject[]>(
        (objects) => {
          this.state = { ...this.state, objects };
          this.recomputeRoutes();
          this.render();
        },
        before,
        after,
        `cmd:${label}`,
        label,
        listEq,
      ),
    );
    this.recomputeRoutes();
    this.render();
    this.geometryChanged();
  }

  /** F-12 `Shift+A`: cycle the selected links' arrow head shape. */
  cycleArrowHead(): void {
    const ids = [...this.selLinks];
    if (ids.length === 0) return;
    const step = (cur: string | undefined): string => {
      const at = MARKER_SHAPES.indexOf((cur ?? 'arrow') as MarkerShape);
      return MARKER_SHAPES[(at + 1) % MARKER_SHAPES.length] ?? 'arrow';
    };
    const before = this.state.links;
    const after = before.map((l) => (this.selLinks.has(l.id) ? { ...l, head: step(l.head) } : l));
    if (listEq(before, after)) return;
    this.state = { ...this.state, links: after };
    this.undo.push(
      new ValueChange<DiagramLink[]>(
        (links) => {
          this.state = { ...this.state, links };
          this.recomputeRoutes();
          this.render();
        },
        before,
        after,
        `link:${ids.join(',')}`,
        s('arrow head'),
        listEq,
      ),
    );
    this.render();
  }

  fitSelection(): void {
    const targets = this.state.objects.filter((o) => this.selObjects.has(o.id));
    if (targets.length === 0) return;
    const before = this.state.objects;
    const after = before.map((o) => {
      if (!this.selObjects.has(o.id)) return o;
        const fit = autoSize({
          text: o.name && o.name.length > 0 ? o.name : o.id,
          kind: o.kind,
          icon: objectIcon(o),
        }, this.measure);
      return { ...o, w: fit.w, h: fit.h, size: { w: fit.w, h: fit.h }, lines: fit.lines };
    });
    if (listEq(before, after)) return;
    this.state = { ...this.state, objects: after };
    this.undo.push(
      new ValueChange<DiagramObject[]>(
        (objects) => {
          this.state = { ...this.state, objects };
          this.recomputeRoutes();
          this.render();
        },
        before,
        after,
        `fit:${targets.map((t) => t.id).join(',')}`,
        s('fit to name'),
        listEq,
      ),
    );
    this.recomputeRoutes();
    this.render();
  }

  private takenObjectIds(): Set<string> {
    return new Set(this.state.objects.map((o) => o.id));
  }

  private takenLinkIds(): Set<string> {
    return new Set(this.state.links.map((l) => l.id));
  }

  /** Quick-add by palette index 1..9 (FR-C3). */
  quickAdd(index1to9: number): string | null {
    const kind = PALETTE_ORDER[index1to9 - 1];
    return kind ? this.addObject(kind) : null;
  }

  /** Patch editable fields of an object (properties panel, FR-C6). */
  updateObject(
    id: string,
    patch: Partial<
      Pick<
        DiagramObject,
        'name' | 'description' | 'technology' | 'tags' | 'dashed' | 'properties' | 'style'
      >
    >,
  ): void {
    const before = this.state.objects;
    const after = before.map((o) => (o.id === id ? this.patched(o, patch) : o));
    if (listEq(before, after)) return;
    this.state = { ...this.state, objects: after };
    this.undo.push(
      new ValueChange<DiagramObject[]>(
        (objects) => {
          this.state = { ...this.state, objects };
          this.render();
        },
        before,
        after,
        `props:${id}`,
        s('edit properties'),
        listEq,
      ),
    );
    this.render();
  }

  /** Patch a link (type/label/dashed, FR-C7). */
  updateLink(
    id: string,
    patch: Partial<
      Pick<DiagramLink, 'type' | 'label' | 'dashed' | 'bidir' | 'head' | 'tail' | 'line' | 'route' | 'width'>
    >,
  ): void {
    const before = this.state.links;
    const after = before.map((l) => (l.id === id ? { ...l, ...patch } : l));
    if (listEq(before, after)) return;
    this.state = { ...this.state, links: after };
    this.undo.push(
      new ValueChange<DiagramLink[]>(
        (links) => {
          this.state = { ...this.state, links };
          this.recomputeRoutes();
          this.render();
        },
        before,
        after,
        `link:${id}`,
        s('edit link'),
        listEq,
      ),
    );
    this.recomputeRoutes();
    this.render();
  }

  deleteSelection(): void {
    if (this.selObjects.size === 0 && this.selLinks.size === 0) return;
    const removed = new Set(this.selObjects);
    const before = this.state;
    const after: DiagramState = {
      objects: before.objects.filter((o) => !removed.has(o.id)),
      links: before.links.filter(
        (l) => !removed.has(l.from) && !removed.has(l.to) && !this.selLinks.has(l.id),
      ),
    };
    this.state = after;
    this.selectObjects([]);
    this.selLinks.clear();
    this.undo.push({
      label: s('delete'),
      undo: () => this.applyState(before),
      redo: () => this.applyState(after),
      coalesce: () => null,
    });
    this.render();
  }

  setSelection(objects: string[], links: string[] = []): void {
    this.selObjects = new Set(objects);
    this.selLinks = new Set(links);
    this.render();
  }

  toggleGrid(): boolean {
    this.gridOn = !this.gridOn;
    this.renderer.setGrid(this.gridOn);
    return this.gridOn;
  }

  fitDiagram(): void {
    const u = unionRects(this.state.objects);
    if (u) this.setTransform(fitRect(u, this.viewSize()));
  }

  /** Mini-map navigation: center a canvas point without changing zoom. */
  centerOn(p: Point): void {
    const { w, h } = this.viewSize();
    this.setTransform({ x: w / 2 - p.x * this.t.k, y: h / 2 - p.y * this.t.k, k: this.t.k });
  }

  /** Mini-map keyboard navigation uses the same screen-space pan as the canvas. */
  panBy(dx: number, dy: number): void {
    this.setTransform(panBy(this.t, dx, dy));
  }

  /**
   * F-20: show imported objects as ghosts. They are laid out in extra grid rows
   * below the document's own objects and are never written back to the file.
   */
  setGhosts(list: Array<DiagramObject & { path: string }>): void {
    // Never re-render (and therefore never trigger a canvas write) when the
    // ghost set is unchanged — otherwise merely opening a file looks like an
    // edit and marks it dirty (F-20 regression).
    const key = (xs: Array<DiagramObject & { path: string }>): string =>
      JSON.stringify(xs.map((g) => [g.id, g.x, g.y, g.w, g.h, g.name, g.path]));
    if (key(this.ghosts) === key(list)) return;
    this.ghosts = list;
    // links may end at a ghost (`alias.id`), so their routes must be recomputed
    this.recomputeRoutes();
    this.render();
  }

  /**
   * F-23: ring the objects whose statement is currently invalid. The canvas keeps
   * showing the last good document; the ring tells the user where the error is.
   */
  setErrors(ids: Iterable<string>): void {
    this.errorIds = new Set(ids);
    for (const o of this.state.objects) {
      this.renderer.elementFor(o.id)?.classList.toggle('pc-error', this.errorIds.has(o.id));
    }
  }

  /** True once a file (or an explicit empty state) has been loaded. */
  isHydrated(): boolean {
    return this.hydrated;
  }

  loadState(state: DiagramState): void {
    // F-13: fit-to-name is a canvas-side computation, so it also runs on load —
    // objects without explicit `size` are sized to their label instead of the
    // kind default (which would overflow a long name).
    this.state = { ...state, objects: state.objects.map((o) => this.fitted(o)) };
    this.hydrated = true;
    // F-02: re-baseline the id sequence from the loaded ids, otherwise the
    // first added object reuses an id that already exists in the file and one
    // of the two entities is lost on reload.
    this.seq = Math.max(
      0,
      ...state.objects.map((o) => seqOf(o.id, 'o')),
      ...state.links.map((l) => seqOf(l.id, 'l')),
    );
    this.selectObjects([]);
    this.recomputeRoutes();
    this.render();
  }

  // ---- M6: session fade (FR-V1) + saved/auto positions (FR-V2/V3/V4) -------

  private fadedObjects = new Set<string>();
  private fadedLinks = new Set<string>();

  /**
   * Session fade: elements in the given id sets get the `pc-faded` class
   * (render-layer opacity animation; FR-V1). Purely visual — no undo, no
   * emit, survives re-renders until cleared.
   */
  setFaded(objects: Iterable<string>, links: Iterable<string>): void {
    this.fadedObjects = new Set(objects);
    this.fadedLinks = new Set(links);
    this.renderer.setFade(this.fadedObjects, this.fadedLinks);
  }

  /**
   * Session reposition (view switch / auto-layout preview): moves objects to
   * the given top-left positions, recomputes routes, re-renders. Not undoable
   * and not persisted — the file only changes via explicit apply-to-file
   * (engine/layout/apply.ts, FILE-FORMAT §7.2). Ids without an entry stay put.
   */
  applyPositions(pos: Record<string, { x: number; y: number }>): void {
    const objects = this.state.objects.map((o) => {
      const p = pos[o.id];
      return p ? { ...o, x: p.x, y: p.y } : o;
    });
    this.state = { ...this.state, objects };
    this.recomputeRoutes();
    this.render();
  }

  /**
   * Apply a computed layout and record it on the undo stack (F-14: only
   * Auto-layout/Reset reorganise, and both are undoable). Positions are then
   * persisted through the geometry hook.
   */
  applyLayoutCommand(next: Record<string, { x: number; y: number }>, label = 'auto-layout'): void {
    const before = this.currentPositions();
    this.applyPositions(next);
    this.geometryChanged(before);
    this.undo.push({
      label,
      undo: () => {
        this.applyPositions(before);
        this.geometryChanged(this.currentPositions());
      },
      redo: () => {
        this.applyPositions(next);
        this.geometryChanged(this.currentPositions());
      },
      coalesce: () => null,
    });
  }

  /** Emit the positions that differ from `before` (F-14 commit hook). */
  private geometryChanged(before?: Record<string, { x: number; y: number }>): void {
    if (!this.onGeometry) return;
    const now = this.currentPositions();
    const changed: Record<string, { x: number; y: number }> = {};
    for (const [id, p] of Object.entries(now)) {
      const b = before?.[id];
      if (!b || b.x !== p.x || b.y !== p.y) changed[id] = p;
    }
    if (Object.keys(changed).length > 0) this.onGeometry(changed);
  }

  /** Current positions of all objects (top-left, canvas units). */
  currentPositions(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const o of this.state.objects) out[o.id] = { x: o.x, y: o.y };
    return out;
  }

  /**
   * Jump-to (M6 search/deps click-through): select the object and center the
   * viewport on it. No-op for unknown ids.
   */
  reveal(id: string): void {
    const o = this.state.objects.find((ob) => ob.id === id);
    if (!o) return;
    this.selectObjects([id]);
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const { w, h } = this.viewSize();
    this.setTransform({ x: w / 2 - cx * this.t.k, y: h / 2 - cy * this.t.k, k: this.t.k });
    // paint now: selection class + halo — no other render is pending
    this.render();
  }

  // ---- undo command helpers ----------------------------------------------

  private applyState(s: DiagramState): void {
    this.state = s;
    this.recomputeRoutes();
    this.render();
  }

  private addRemoveCommand(obj: DiagramObject, before: DiagramObject[]): CoalescableCommand {
    const afterObjects = [...before, obj];
    return {
      label: s('add object'),
      undo: () => this.applyState({ ...this.state, objects: before }),
      redo: () => this.applyState({ ...this.state, objects: afterObjects }),
      coalesce: () => null,
    };
  }

  // ---- geometry helpers ---------------------------------------------------

  private viewSize(): { w: number; h: number } {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width || 800, h: r.height || 600 };
  }

  private screenOf(e: { clientX: number; clientY: number }): Point {
    const r = this.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toCanvas(e: { clientX: number; clientY: number }): Point {
    return invert(this.t, this.screenOf(e));
  }

  private centerOfView(): Point {
    const { w, h } = this.viewSize();
    return invert(this.t, { x: w / 2, y: h / 2 });
  }

  private setTransform(t: Transform): void {
    this.t = t;
    this.renderer.setWorldTransform(t);
    this.emit();
  }

  /** Move the camera WITHOUT emitting a snapshot — flow playback only, so
   * the code-sync bridge never sees a camera-driven scene change. */
  applyCamera(t: Transform): void {
    this.t = t;
    this.renderer.setWorldTransform(t);
    // Local overlay notification only; the app snapshot/code-sync path stays silent.
    this.svg.dispatchEvent(new CustomEvent<Transform>('pc-camera', { detail: t }));
  }

  private recomputeRoutes(): void {
    this.routes.clear();
    // F-20: an endpoint may be an imported ghost (`alias.id`) — route to it too
    const endpoint = (id: string): { x: number; y: number; w: number; h: number } | undefined =>
      this.state.objects.find((o) => o.id === id) ?? this.ghosts.find((g) => g.id === id);
    for (const link of this.state.links) {
      const from = endpoint(link.from);
      const to = endpoint(link.to);
      if (!from || !to) continue;
      const obstacles = this.state.objects.filter(
        (o) => o.kind !== 'group' && o.id !== link.from && o.id !== link.to,
      );
      this.routes.set(
        link.id,
        routeLink({
          from, to, obstacles,
          ...(link.waypoints ? { waypoints: link.waypoints } : {}),
          ...(link.fromAnchor !== undefined ? { fromAnchor: link.fromAnchor } : {}),
          ...(link.toAnchor !== undefined ? { toAnchor: link.toAnchor } : {}),
        }, link.route),
      );
    }
  }

  private sceneLinks(): SceneLink[] {
    return this.state.links.flatMap((l) => {
      const points = this.routes.get(l.id);
      if (!points) return [];
      return [
        {
          id: l.id,
          points,
          label: l.label,
          dashed: l.dashed,
          type: l.type,
          head: (l.head ?? 'arrow') as MarkerShape,
          tail: (l.tail ?? 'none') as MarkerShape,
          line: (l.line ?? (l.dashed ? 'dashed' : 'solid')) as 'solid' | 'dashed' | 'dotted',
          route: l.route,
          width: l.width,
        },
      ];
    });
  }

  // ---- render + notify ----------------------------------------------------

  private render(notify = true): void {
    const scene: Scene = {
      objects: [
        ...this.state.objects.map((o) => ({
          id: o.id,
          kind: o.kind,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
          name: o.name,
          dashed: o.dashed,
          icon: objectIcon(o),
          labelLines: o.lines,
          style: o.style,
        })),
        ...this.ghosts.map((g) => ({
          id: g.id,
          kind: g.kind,
          x: g.x,
          y: g.y,
          w: g.w,
          h: g.h,
          name: g.name,
          ghost: true,
        })),
      ],
      links: this.sceneLinks(),
    };
    this.renderer.render(scene);
    // F-23: error rings survive re-renders (structural rebuilds reset classes)
    for (const o of this.state.objects) {
      this.renderer.elementFor(o.id)?.classList.toggle('pc-error', this.errorIds.has(o.id));
    }
    this.renderer.setSelection([...this.selObjects], [...this.selLinks]);
    if (this.mode.t === 'idle') this.paintIdleOverlay();
    if (notify) this.emit();
  }

  private emit(): void {
    this.onState?.(this.snapshot);
  }

  private paintIdleOverlay(): void {
    this.svg.removeAttribute('aria-description');
    clearOverlay(this.renderer.overlay);
    const obj = this.selectedObject();
    if (obj) {
      drawHalos(this.renderer.overlay, obj, obj.id);
      drawResizeHandle(this.renderer.overlay, obj, obj.id);
      return;
    }
    // F-19: a selected link exposes its explicit waypoints as drag handles
    const link = this.selectedLink();
    if (link) this.drawLinkHandles(link);
  }

  private drawLinkHandles(link: DiagramLink): void {
    if (link.waypoints && link.waypoints.length > 0) {
      drawWaypointHandles(this.renderer.overlay, link.waypoints.map(([x, y]) => ({ x, y })), link.id);
    }
    const route = this.routes.get(link.id);
    if (route) {
      drawEndpointHandles(this.renderer.overlay, route, link.id, {
        from: s('Drag link start anchor'), to: s('Drag link end anchor'),
      });
    }
  }

  private selectObjects(ids: string[]): void {
    this.selObjects = new Set(ids);
    this.selLinks.clear();
  }

  // ---- input wiring -------------------------------------------------------

  private attach(): void {
    const svg = this.svg;
    const on = (
      target: EventTarget,
      type: string,
      fn: EventListener,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn, opts);
      this.detach.push(() => target.removeEventListener(type, fn));
    };

    on(svg, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    on(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    on(window, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
    on(svg, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    on(svg, 'dblclick', (e) => this.onDblClick(e as MouseEvent));
    on(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    on(window, 'keyup', (e) => {
      if ((e as KeyboardEvent).key === ' ') this.spaceDown = false;
    });
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const g = wheelGesture(e);
    if (g.kind === 'zoom') this.setTransform(zoomAt(this.t, this.screenOf(e), g.factor));
    else this.setTransform(panBy(this.t, g.delta.dx, g.delta.dy));
  }

  private onDblClick(e: MouseEvent): void {
    const hit = pick(this.state.objects, this.sceneLinks(), this.toCanvas(e));
    if (hit?.type === 'object') this.onRenameRequest?.(hit.id);
  }

  /** True when the key event belongs to a text field (never hijack typing). */
  private inTextEntry(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (el === null) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.inTextEntry(e.target)) return;
    if (this.handleClipboardKeys(e)) return;
    if (e.key === ' ') {
      this.spaceDown = true;
      return;
    }
    if (this.handleUndoKeys(e)) return;
    if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      this.quickAdd(Number(e.key));
      return;
    }
    if (this.handleNavKeys(e)) return;
    if (this.handleRenameKey(e)) return;
    if (this.handleArrowKey(e)) return;
    if (this.handleActionKey(e)) return;
  }

  /** F-19 mod+C / mod+V / mod+D — true when consumed. */
  private handleClipboardKeys(e: KeyboardEvent): boolean {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false;
    const key = e.key.toLowerCase();
    if (key === 'c' && this.copySelected()) {
      e.preventDefault();
      return true;
    }
    if (key === 'v' && this.canPaste()) {
      e.preventDefault();
      this.pasteCopied();
      return true;
    }
    if (key === 'd' && this.selObjects.size > 0) {
      e.preventDefault();
      this.duplicateSelected();
      return true;
    }
    return false;
  }

  /** mod+z / mod+shift+z / mod+y — true when consumed. */
  private handleUndoKeys(e: KeyboardEvent): boolean {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return false;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return false;
    e.preventDefault();
    if (k === 'z' && !e.shiftKey) this.undoCommand();
    else this.redoCommand();
    return true;
  }

  /** F-25: hover info card — remember which object is under the pointer. */
  private trackHover(p: Point): void {
    const hit = pick(this.state.objects, [], p);
    const id = hit?.type === 'object' ? hit.id : null;
    if (id === this.hoverId) return;
    this.hoverId = id;
    for (const o of this.state.objects) {
      const el = this.renderer.elementFor(o.id);
      el?.classList.toggle('pc-hover', o.id === id);
    }
    this.onHover?.(id === null ? null : this.hoverInfoFor(id));
  }

  /** Data for the hover card (name, technology, description, tags). */
  private hoverInfoFor(id: string): import('./hoverInfo').HoverInfo | null {
    const o = this.state.objects.find((x) => x.id === id);
    if (o === undefined) return null;
    return {
      id: o.id,
      kind: o.kind,
      name: o.name ?? o.id,
      technology: o.technology,
      description: o.description,
      tags: o.tags,
    };
  }

  /** F-24: undo one canvas command (used by the history affordance too). */
  undoCommand(): boolean {
    const label = this.undo.undo();
    if (label === null) return false;
    this.applyState(this.state);
    this.onHistory?.(s('undo {label}', { label }));
    return true;
  }

  /** F-24: redo one canvas command. */
  redoCommand(): boolean {
    const label = this.undo.redo();
    if (label === null) return false;
    this.applyState(this.state);
    this.onHistory?.(s('redo {label}', { label }));
    return true;
  }

  get undoDepth(): number {
    return this.undo.canUndo ? 1 : 0;
  }

  get redoDepth(): number {
    return this.undo.canRedo ? 1 : 0;
  }

  /**
   * F-22: focus one object (keyboard navigation). Focus moves the DOM focus to
   * the scene node so screen readers announce it, and selects it.
   */
  focusObject(id: string): void {
    const el = this.renderer.elementFor(id);
    if (el === undefined) return;
    this.focusId = id;
    this.setSelection([id]); // renders the selection ring
    (el as unknown as HTMLElement).focus?.();
  }

  /** Next object in `dir` from the focused/selected node (wraps around). */
  focusStep(dir: 1 | -1): void {
    const list = this.state.objects;
    if (list.length === 0) return;
    const currentId = this.focusId ?? [...this.selObjects][0] ?? null;
    const at = list.findIndex((o) => o.id === currentId);
    const next = list[(at + dir + list.length) % list.length] ?? list[0]!;
    this.focusObject(next.id);
  }

  /** Nearest object in a direction (arrow-key navigation), or a step fallback. */
  focusDirection(dir: 'left' | 'right' | 'up' | 'down'): void {
    const currentId = this.focusId ?? [...this.selObjects][0] ?? null;
    const from = this.state.objects.find((o) => o.id === currentId);
    const candidates = this.state.objects.filter((o) => o.id !== currentId);
    if (from === undefined || candidates.length === 0) {
      this.focusStep(1);
      return;
    }
    const cx = from.x + from.w / 2;
    const cy = from.y + from.h / 2;
    const score = (o: DiagramObject): number => {
      const dx = o.x + o.w / 2 - cx;
      const dy = o.y + o.h / 2 - cy;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      if (along <= 0) return Number.POSITIVE_INFINITY; // wrong half-plane
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      return along + across * 2; // prefer straight ahead, allow stumbles
    };
    const best = candidates.reduce((a, b) => (score(a) <= score(b) ? a : b));
    if (!Number.isFinite(score(best))) this.focusStep(dir === 'left' || dir === 'up' ? -1 : 1);
    else this.focusObject(best.id);
  }

  /** F-22 roving navigation: Tab/Shift+Tab, arrows, Enter — true when consumed. */
  private handleNavKeys(e: KeyboardEvent): boolean {
    const inside = this.svg.contains(document.activeElement);
    if (e.key === 'Tab' && this.state.objects.length > 0) {
      e.preventDefault();
      this.focusStep(e.shiftKey ? -1 : 1);
      return true;
    }
    if (e.key === 'Enter' && this.focusId !== null) {
      e.preventDefault();
      this.selectObjects([this.focusId]);
      return true;
    }
    if (!inside) return false;
    const dir = arrowDirection(e.key, e.metaKey || e.ctrlKey || e.altKey);
    if (dir === null) return false;
    e.preventDefault();
    this.focusDirection(dir);
    return true;
  }

  /** F-15 F2: rename the selected object in place — true when consumed. */
  private handleRenameKey(e: KeyboardEvent): boolean {
    if (e.key !== 'F2') return false;
    const id = [...this.selObjects][0];
    if (!id) return false;
    e.preventDefault();
    this.onRenameRequest?.(id);
    return true;
  }

  /** F-12 Shift+A: cycle the arrow head of the selected links — true when consumed. */
  private handleArrowKey(e: KeyboardEvent): boolean {
    if (!e.shiftKey || e.metaKey || e.ctrlKey || e.key.toLowerCase() !== 'a') return false;
    e.preventDefault();
    this.cycleArrowHead();
    return true;
  }

  /** Keymap actions (viewport/delete/escape) — true when consumed. */
  private handleActionKey(e: KeyboardEvent): boolean {
    const action = actionFor(e.key, e.metaKey || e.ctrlKey);
    if (!action) return false;
    e.preventDefault();
    this.runAction(action);
    return true;
  }

  private runAction(action: string): void {
    const { w, h } = this.viewSize();
    const center = { x: w / 2, y: h / 2 };
    const pans: Record<string, [number, number]> = {
      'pan-left': [PAN_STEP_PX, 0],
      'pan-right': [-PAN_STEP_PX, 0],
      'pan-up': [0, PAN_STEP_PX],
      'pan-down': [0, -PAN_STEP_PX],
    };
    if (action in pans) {
      const [dx, dy] = pans[action] ?? [0, 0];
      this.setTransform(panBy(this.t, dx, dy));
      return;
    }
    if (action === 'zoom-in') return void this.setTransform(zoomAt(this.t, center, ZOOM_STEP));
    if (action === 'zoom-out') return void this.setTransform(zoomAt(this.t, center, 1 / ZOOM_STEP));
    if (action === 'zoom-reset') return void this.setTransform({ x: 0, y: 0, k: 1 });
    if (action === 'fit-diagram') return void this.fitDiagram();
    if (action === 'grid-toggle') return void this.toggleGrid();
    if (action === 'delete') return void this.deleteSelection();
    if (action === 'escape') {
      if (this.mode.t === 'resize') {
        const { id, original } = this.mode;
        this.state = {
          ...this.state,
          objects: this.state.objects.map((o) => o.id === id ? original : o),
        };
        this.recomputeRoutes();
      } else if (this.mode.t === 'endpoint') {
        const { linkId, before } = this.mode;
        this.state = {
          ...this.state,
          links: this.state.links.map((l) => l.id === linkId ? { ...l, ...before } : l),
        };
        this.recomputeRoutes();
      }
      this.mode = { t: 'idle' };
      this.selectObjects([]);
      this.render();
    }
  }

  // ---- pointer modes ------------------------------------------------------

  private onPointerDown(e: PointerEvent): void {
    if (this.beginPanOrHalo(e)) return;
    if (e.button !== 0) return;
    const p = this.toCanvas(e);
    // F-20: an imported ghost is read-only — clicking it opens its source file
    const ghost = this.ghosts.find(
      (g) => p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h,
    );
    if (ghost) {
      this.onGhostOpen?.(ghost.path);
      return;
    }
    const hit = pick(this.state.objects, this.sceneLinks(), p);
    if (hit?.type === 'object') {
      this.beginObjectDrag(hit.id, e, p);
      return;
    }
    if (hit?.type === 'link') {
      this.selectLink(hit.id, e.shiftKey);
      return;
    }
    this.beginBand(e, p);
  }

  /** Pan (middle/space) + halo/link-drag + resize-handle starts. */
  private beginPanOrHalo(e: PointerEvent): boolean {
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.mode = { t: 'pan', startScreen: this.screenOf(e), startT: this.t };
      return true;
    }
    if (e.button !== 0) return false;
    const halo = haloTarget(e);
    if (halo) {
      this.mode = { t: 'link', fromId: halo.id, fromSide: halo.side };
      return true;
    }
    if (this.beginLinkHandle(e)) return true;
    const target = resizeTarget(e);
    if (target) {
      const obj = this.state.objects.find((o) => o.id === target.id);
      if (obj) {
        this.mode = {
          t: 'resize',
          id: obj.id,
          handle: target.handle,
          startCanvas: this.toCanvas(e),
          before: rectOf(obj),
          original: obj,
        };
      }
      return true;
    }
    return false;
  }

  private beginLinkHandle(e: PointerEvent): boolean {
    // F-19: dragging a waypoint handle re-routes the selected link.
    const wp = waypointTarget(e);
    if (wp) {
      const link = this.state.links.find((l) => l.id === wp.linkId);
      if (link) {
        this.mode = {
          t: 'waypoint',
          linkId: wp.linkId,
          index: wp.index,
          before: (link.waypoints ?? []).map((w) => [w[0], w[1]] as [number, number]),
        };
      }
      return true;
    }
    const endpoint = endpointTarget(e);
    if (!endpoint) return false;
    const link = this.state.links.find((l) => l.id === endpoint.linkId);
    if (link) {
      this.mode = {
        t: 'endpoint', linkId: link.id, end: endpoint.end,
        before: { fromAnchor: link.fromAnchor, toAnchor: link.toAnchor },
      };
    }
    return true;
  }

  private selectLink(id: string, additive: boolean): void {
    this.selLinks = additive ? new Set([...this.selLinks, id]) : new Set([id]);
    this.selObjects.clear();
    this.render();
  }

  private beginBand(e: PointerEvent, p: Point): void {
    if (!e.shiftKey) this.selectObjects([]);
    this.mode = { t: 'band', startCanvas: p, additive: e.shiftKey };
    this.render();
  }

  private beginObjectDrag(id: string, e: PointerEvent, p: Point): void {
    if (e.shiftKey) {
      if (this.selObjects.has(id)) this.selObjects.delete(id);
      else this.selObjects.add(id);
      this.render();
      return;
    }
    if (!this.selObjects.has(id)) this.selectObjects([id]);
    this.render();
    const before = this.state.objects
      .filter((o) => this.selObjects.has(o.id))
      .map((o) => ({ id: o.id, x: o.x, y: o.y }));
    this.mode = { t: 'drag', startCanvas: p, before, moved: false };
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.mode.t === 'idle') this.trackHover(this.toCanvas(e));
    switch (this.mode.t) {
      case 'pan': {
        const s = this.screenOf(e);
        this.setTransform(
          panBy(this.mode.startT, s.x - this.mode.startScreen.x, s.y - this.mode.startScreen.y),
        );
        break;
      }
      case 'drag':
        this.dragMove(e);
        break;
      case 'band':
        this.bandMove(e);
        break;
      case 'link':
        this.linkMove(e);
        break;
      case 'resize':
        this.resizeMove(e);
        break;
      case 'endpoint':
        this.endpointMove(e);
        break;
      case 'waypoint':
        this.waypointMove(e);
        break;
      default:
        break;
    }
  }

  private dragMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'drag') return;
    const p = this.toCanvas(e);
    const dx = p.x - m.startCanvas.x;
    const dy = p.y - m.startCanvas.y;
    if (!m.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    m.moved = true;
    let gx = 0;
    let gy = 0;
    const guides: Guide[] = [];
    if (m.before.length === 1) {
      const rec = m.before[0];
      const obj = rec ? this.state.objects.find((o) => o.id === rec.id) : undefined;
      if (rec && obj) {
        const proposed: Rect = { x: rec.x + dx, y: rec.y + dy, w: obj.w, h: obj.h };
        const others = this.state.objects.filter((o) => !this.selObjects.has(o.id));
        const g = computeGuides(proposed, others);
        gx = g.dx;
        gy = g.dy;
        guides.push(...g.guides);
      }
    }
    const guided = guides.length > 0;
    const next = this.state.objects.map((o) => {
      const rec = m.before.find((b) => b.id === o.id);
      if (!rec) return o;
      return guided
        ? { ...o, x: rec.x + dx + gx, y: rec.y + dy + gy }
        : { ...o, x: snapToGrid(rec.x + dx), y: snapToGrid(rec.y + dy) };
    });
    this.state = { ...this.state, objects: next };
    this.recomputeRoutes();
    this.render();
    clearOverlay(this.renderer.overlay);
    drawGuides(this.renderer.overlay, guides);
  }

  private bandMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'band') return;
    const band = normRect(m.startCanvas, this.toCanvas(e));
    clearOverlay(this.renderer.overlay);
    drawRubberBand(this.renderer.overlay, band);
    const ids = this.state.objects.filter((o) => rectsOverlap(o, band)).map((o) => o.id);
    const base = m.additive ? [...this.selObjects] : [];
    this.renderer.setSelection([...new Set([...base, ...ids])], [...this.selLinks]);
  }

  private linkMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'link') return;
    const from = this.state.objects.find((o) => o.id === m.fromId);
    if (!from) return;
    clearOverlay(this.renderer.overlay);
    drawGhostLink(this.renderer.overlay, portPoint(from, m.fromSide), this.toCanvas(e));
    const p = this.toCanvas(e);
    const hit = pick(
      this.state.objects.filter((o) => o.id !== m.fromId),
      [],
      p,
    );
    for (const o of this.state.objects) {
      this.renderer.elementFor(o.id)?.classList.toggle(
        'pc-link-target',
        hit?.type === 'object' && hit.id === o.id,
      );
    }
  }

  private resizeMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'resize') return;
    const candidates = [
      ...this.state.objects.filter((o) => o.id !== m.id),
      ...this.ghosts,
    ].map(resizeCandidate);
    const { rect: snapped, cues } = resizedRectWithCues(
      m.before,
      m.handle,
      this.toCanvas(e),
      candidates,
    );
    this.state = {
      ...this.state,
      objects: this.state.objects.map((o) => {
        if (o.id !== m.id) return o;
        const text = o.name && o.name.length > 0 ? o.name : o.id;
        const lines = explicitLines(o, text, this.measure, snapped.w);
        return {
          ...o,
          x: snapped.x,
          y: snapped.y,
          w: snapped.w,
          h: snapped.h,
          size: { w: snapped.w, h: snapped.h },
          lines,
        };
      }),
    };
    this.recomputeRoutes();
    // Intermediate geometry is view-only: commit/cancel owns code sync and persistence.
    this.render(false);
    clearOverlay(this.renderer.overlay);
    drawResizeHandle(this.renderer.overlay, snapped, m.id);
    drawResizeCues(this.renderer.overlay, cues);
    const description = resizeStatus(cues);
    if (description) this.svg.setAttribute('aria-description', description);
    else this.svg.removeAttribute('aria-description');
  }

  private endpointMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'endpoint') return;
    const link = this.state.links.find((l) => l.id === m.linkId);
    const objectId = m.end === 'from' ? link?.from : link?.to;
    const object = this.state.objects.find((o) => o.id === objectId) ?? this.ghosts.find((g) => g.id === objectId);
    if (!link || !object) return;
    const { t } = projectPerimeter(object, this.toCanvas(e));
    this.state = {
      ...this.state,
      links: this.state.links.map((l) => l.id === link.id ? { ...l, [`${m.end}Anchor`]: t } : l),
    };
    this.recomputeRoutes();
    this.render(false);
    clearOverlay(this.renderer.overlay);
    this.drawLinkHandles(link);
    this.svg.setAttribute('aria-description', s('Link {endpoint} anchored to {label} perimeter ({value})', {
      endpoint: m.end, label: object.name || object.id, value: Number(t.toFixed(4)),
    }));
  }

  private commitEndpoint(): void {
    const m = this.mode;
    if (m.t !== 'endpoint') return;
    const link = this.state.links.find((l) => l.id === m.linkId);
    if (!link) return;
    const after = { fromAnchor: link.fromAnchor, toAnchor: link.toAnchor };
    if (JSON.stringify(after) === JSON.stringify(m.before)) return;
    const set = (anchors: Pick<DiagramLink, 'fromAnchor' | 'toAnchor'>): void => {
      this.state = {
        ...this.state,
        links: this.state.links.map((l) => l.id === m.linkId ? { ...l, ...anchors } : l),
      };
      this.recomputeRoutes();
      this.render();
    };
    this.undo.push({
      label: s('move link {endpoint} anchor', { endpoint: m.end }),
      undo: () => set(m.before),
      redo: () => set(after),
      coalesce: () => null,
    });
  }

  private onPointerUp(e: PointerEvent): void {
    switch (this.mode.t) {
      case 'drag':
        this.commitDrag();
        break;
      case 'band':
        this.commitBand(e);
        break;
      case 'link':
        this.commitLink(e);
        break;
      case 'resize':
        this.commitResize();
        break;
      case 'endpoint':
        this.commitEndpoint();
        break;
      case 'waypoint':
        this.commitWaypoint();
        break;
      default:
        break;
    }
    this.mode = { t: 'idle' };
    for (const o of this.state.objects) {
      this.renderer.elementFor(o.id)?.classList.remove('pc-link-target');
    }
    this.render();
  }

  /** F-19: drag one waypoint; the route re-elbows through the new position. */
  private waypointMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'waypoint') return;
    const p = this.toCanvas(e);
    const next: [number, number] = [snapToGrid(p.x), snapToGrid(p.y)];
    this.state = {
      ...this.state,
      links: this.state.links.map((l) => {
        if (l.id !== m.linkId) return l;
        const wps = (l.waypoints ?? []).map((w, i) => (i === m.index ? next : w));
        return { ...l, waypoints: wps as [number, number][] };
      }),
    };
    this.recomputeRoutes();
    this.render();
  }

  private commitWaypoint(): void {
    const m = this.mode;
    if (m.t !== 'waypoint') return;
    const after = this.state.links.find((l) => l.id === m.linkId)?.waypoints ?? [];
    if (JSON.stringify(after) === JSON.stringify(m.before)) return;
    const set = (wps: [number, number][]): void => {
      this.state = {
        ...this.state,
        links: this.state.links.map((l) => (l.id === m.linkId ? { ...l, waypoints: wps } : l)),
      };
      this.recomputeRoutes();
      this.render();
    };
    this.undo.push({
      label: s('move waypoint'),
      undo: () => set(m.before),
      redo: () => set(after as [number, number][]),
      coalesce: () => null,
    });
  }

  private commitDrag(): void {
    const m = this.mode;
    if (m.t !== 'drag' || !m.moved) return;
    const after: PositionRec[] = this.state.objects
      .filter((o) => m.before.some((b) => b.id === o.id))
      .map((o) => ({ id: o.id, x: o.x, y: o.y }));
    const set = (recs: PositionRec[]) => {
      this.state = {
        ...this.state,
        objects: this.state.objects.map((o) => {
          const r = recs.find((c) => c.id === o.id);
          return r ? { ...o, x: r.x, y: r.y } : o;
        }),
      };
      this.recomputeRoutes();
      this.render();
    };
    this.undo.push({
      label: s('move'),
      coalesceKey: m.before.length === 1 ? `pos:${m.before[0]?.id}` : 'pos:multi',
      undo: () => {
        set(m.before);
        this.geometryChanged();
      },
      redo: () => {
        set(after);
        this.geometryChanged();
      },
      coalesce: () => null,
    });
    // F-14: the drag end commits the moved positions to the active view
    const beforePos: Record<string, { x: number; y: number }> = {};
    for (const b of m.before) beforePos[b.id] = { x: b.x, y: b.y };
    this.geometryChanged(beforePos);
  }

  private commitBand(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'band') return;
    const band = normRect(m.startCanvas, this.toCanvas(e));
    const ids = band.w < 2 && band.h < 2
      ? []
      : this.state.objects.filter((o) => rectsOverlap(o, band)).map((o) => o.id);
    this.selectObjects([...new Set([...(m.additive ? [...this.selObjects] : []), ...ids])]);
  }

  private commitLink(e: PointerEvent): void {
    const m = this.mode;
    if (m.t !== 'link') return;
    const hit = pick(
      this.state.objects.filter((o) => o.id !== m.fromId),
      [],
      this.toCanvas(e),
    );
    if (hit?.type !== 'object') return;
    const id = uniqueId(this.takenLinkIds(), 'l', ++this.seq);
    this.seq = Math.max(this.seq, seqOf(id, 'l'));
    // F-08: a canvas-drawn link is untyped until the user picks a type
    const link: DiagramLink = { id, from: m.fromId, to: hit.id };
    const before = this.state.links;
    const after = [...before, link];
    this.state = { ...this.state, links: after };
    this.recomputeRoutes();
    this.undo.push({
      label: s('connect'),
      undo: () => this.applyState({ ...this.state, links: before }),
      redo: () => this.applyState({ ...this.state, links: after }),
      coalesce: () => null,
    });
  }

  private commitResize(): void {
    const m = this.mode;
    if (m.t !== 'resize') return;
    // one undo entry per drag: the before-rect is restored without a size flag
    // unless the object already had an explicit size
    const before = this.state.objects.map((o) => o.id === m.id ? m.original : o);
    const after = this.state.objects;
    if (listEq(before, after)) return;
    this.undo.push(
      new ValueChange<DiagramObject[]>(
        (objects) => {
          this.state = { ...this.state, objects };
          this.recomputeRoutes();
          this.render();
        },
        before,
        after,
        `size:${m.id}`,
        'resize',
        listEq,
      ),
    );
  }
}
