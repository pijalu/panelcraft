// SPDX-License-Identifier: GPL-3.0-only
// Canvas controller (M2-WP1/4/6 wiring): owns diagram state + viewport,
// translates pointer/wheel/keyboard input into mode state machines, commits
// mutations through the undo stack (FR-C1/C2/C4/C7/C9). DOM writes go to the
// SceneRenderer only; App reads snapshots via onState.

import { SceneRenderer, type Scene, type SceneLink } from '../engine/render/scenegraph';
import { routeOrtho, portPoint, type Side, type Polyline } from '../engine/render/router';
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
import { snapToGrid, computeGuides, GRID_SIZE } from '../engine/render/snap';
import type { Guide } from '../engine/render/snap';
import { pick } from '../engine/render/hit-test';
import {
  clearOverlay,
  drawRubberBand,
  drawGuides,
  drawGhostLink,
  drawHalos,
  drawResizeHandle,
  type HaloSide,
} from '../engine/render/overlay';
import { ValueChange, UndoStack, type CoalescableCommand } from '../workspace/undo';
import type { Kind } from '../engine/model/types';

export interface DiagramObject {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
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

const RESIZE_KINDS: ReadonlySet<Kind> = new Set(['group']);
const DRAG_THRESHOLD = 2;

type Mode =
  | { t: 'idle' }
  | { t: 'pan'; startScreen: Point; startT: Transform }
  | { t: 'drag'; startCanvas: Point; before: PositionRec[]; moved: boolean }
  | { t: 'band'; startCanvas: Point; additive: boolean }
  | { t: 'link'; fromId: string; fromSide: Side }
  | { t: 'resize'; id: string; startCanvas: Point; before: Rect };

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
}

export function labelFor(kind: Kind): string {
  return kind
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
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

function resizeTarget(e: Event): string | null {
  return (e.target as Element | null)?.closest('.pc-resize-handle')?.getAttribute('data-id') ?? null;
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
  private readonly onState?: (s: Snapshot) => void;
  private readonly onRenameRequest?: (id: string) => void;
  private detach: Array<() => void> = [];

  constructor(svg: SVGSVGElement, opts: ControllerOptions = {}) {
    this.svg = svg;
    this.undo = opts.undo ?? new UndoStack();
    this.onState = opts.onState;
    this.onRenameRequest = opts.onRenameRequest;
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
    const obj: DiagramObject = { id, kind, x, y, w: size.w, h: size.h, name: `${labelFor(kind)} ${seqOf(id, 'o')}` };
    const before = this.state.objects;
    this.state = { ...this.state, objects: [...before, obj] };
    this.selectObjects([id]);
    this.undo.push(this.addRemoveCommand(obj, before));
    this.render();
    return id;
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
    patch: Partial<Pick<DiagramObject, 'name' | 'description' | 'technology' | 'tags' | 'dashed'>>,
  ): void {
    const before = this.state.objects;
    const after = before.map((o) => (o.id === id ? { ...o, ...patch } : o));
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
        'edit properties',
        listEq,
      ),
    );
    this.render();
  }

  /** Patch a link (type/label/dashed, FR-C7). */
  updateLink(
    id: string,
    patch: Partial<Pick<DiagramLink, 'type' | 'label' | 'dashed' | 'bidir'>>,
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
        'edit link',
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
      label: 'delete',
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

  loadState(state: DiagramState): void {
    this.state = state;
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
      label: 'add object',
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
  }

  private recomputeRoutes(): void {
    this.routes.clear();
    for (const link of this.state.links) {
      const from = this.state.objects.find((o) => o.id === link.from);
      const to = this.state.objects.find((o) => o.id === link.to);
      if (!from || !to) continue;
      const obstacles = this.state.objects.filter((o) => o.id !== from.id && o.id !== to.id);
      this.routes.set(link.id, routeOrtho({ from, to, obstacles }));
    }
  }

  private sceneLinks(): SceneLink[] {
    return this.state.links.flatMap((l) => {
      const points = this.routes.get(l.id);
      return points ? [{ id: l.id, points, label: l.label, dashed: l.dashed }] : [];
    });
  }

  // ---- render + notify ----------------------------------------------------

  private render(): void {
    const scene: Scene = {
      objects: this.state.objects.map((o) => ({
        id: o.id,
        kind: o.kind,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        name: o.name,
        dashed: o.dashed,
        icon: o.icon,
      })),
      links: this.sceneLinks(),
    };
    this.renderer.render(scene);
    this.renderer.setSelection([...this.selObjects], [...this.selLinks]);
    if (this.mode.t === 'idle') this.paintIdleOverlay();
    this.emit();
  }

  private emit(): void {
    this.onState?.(this.snapshot);
  }

  private paintIdleOverlay(): void {
    clearOverlay(this.renderer.overlay);
    const obj = this.selectedObject();
    if (obj) {
      drawHalos(this.renderer.overlay, obj, obj.id);
      if (RESIZE_KINDS.has(obj.kind)) drawResizeHandle(this.renderer.overlay, obj, obj.id);
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

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === ' ') {
      this.spaceDown = true;
      return;
    }
    if (this.handleUndoKeys(e)) return;
    if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      this.quickAdd(Number(e.key));
      return;
    }
    if (this.handleActionKey(e)) return;
  }

  /** mod+z / mod+shift+z / mod+y — true when consumed. */
  private handleUndoKeys(e: KeyboardEvent): boolean {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return false;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return false;
    e.preventDefault();
    if (k === 'z' && !e.shiftKey) this.undo.undo();
    else this.undo.redo();
    this.applyState(this.state);
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
    const handleId = resizeTarget(e);
    if (handleId) {
      const obj = this.state.objects.find((o) => o.id === handleId);
      if (obj) this.mode = { t: 'resize', id: obj.id, startCanvas: this.toCanvas(e), before: rectOf(obj) };
      return true;
    }
    return false;
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
    const p = this.toCanvas(e);
    // top-left anchored; far edge snaps to grid (FR-C4, groups only)
    const x2 = Math.max(m.before.x + GRID_SIZE, snapToGrid(p.x));
    const y2 = Math.max(m.before.y + GRID_SIZE, snapToGrid(p.y));
    const snapped: Rect = {
      x: m.before.x,
      y: m.before.y,
      w: x2 - m.before.x,
      h: y2 - m.before.y,
    };
    this.state = {
      ...this.state,
      objects: this.state.objects.map((o) =>
        o.id === m.id ? { ...o, x: snapped.x, y: snapped.y, w: snapped.w, h: snapped.h } : o,
      ),
    };
    this.recomputeRoutes();
    this.render();
    clearOverlay(this.renderer.overlay);
    drawResizeHandle(this.renderer.overlay, snapped, m.id);
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
      default:
        break;
    }
    this.mode = { t: 'idle' };
    for (const o of this.state.objects) {
      this.renderer.elementFor(o.id)?.classList.remove('pc-link-target');
    }
    this.render();
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
      label: 'move',
      coalesceKey: m.before.length === 1 ? `pos:${m.before[0]?.id}` : 'pos:multi',
      undo: () => set(m.before),
      redo: () => set(after),
      coalesce: () => null,
    });
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
      label: 'connect',
      undo: () => this.applyState({ ...this.state, links: before }),
      redo: () => this.applyState({ ...this.state, links: after }),
      coalesce: () => null,
    });
  }

  private commitResize(): void {
    const m = this.mode;
    if (m.t !== 'resize') return;
    const before = this.state.objects.map((o) =>
      o.id === m.id ? { ...o, x: m.before.x, y: m.before.y, w: m.before.w, h: m.before.h } : o,
    );
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
