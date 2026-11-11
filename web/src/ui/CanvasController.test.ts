// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Canvas controller tests (M2-WP1/4/6 wiring): viewport, selection, drag with
// snap+guides, rubber band, link halo→commit, delete/undo/redo, quick-add,
// properties updates, group resize. addObject() centers shapes at `at`.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CanvasController, type Snapshot } from './CanvasController';
import { GRID_SIZE } from '../engine/render/snap';

const SVG_NS = 'http://www.w3.org/2000/svg';

let svg: SVGSVGElement;
let ctrl: CanvasController;
let snapshots: Snapshot[];

function stubRect(): void {
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
}

function ptr(
  type: string,
  x: number,
  y: number,
  opts: Partial<MouseEventInit & { pointerId: number }> = {},
): MouseEvent {
  return new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
}

function key(type: string, init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
}

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  stubRect();
  document.body.appendChild(svg);
  snapshots = [];
  ctrl = new CanvasController(svg, { onState: (s) => snapshots.push(s) });
});

afterEach(() => {
  ctrl.destroy();
  svg.remove();
});

const obj = (id: string) => {
  const o = ctrl.snapshot.objects.find((ob) => ob.id === id);
  if (!o) throw new Error(`missing ${id}`);
  return o;
};

const center = (id: string) => {
  const o = obj(id);
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
};

const drag = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
  svg.dispatchEvent(ptr('pointerdown', from.x, from.y));
  window.dispatchEvent(ptr('pointermove', to.x, to.y));
  window.dispatchEvent(ptr('pointerup', to.x, to.y));
};

/** pointerdown on an overlay handle element (halo/resize), then drag via window. */
const dragFromEl = (el: Element, to: { x: number; y: number }): void => {
  const x = Number(el.getAttribute('cx'));
  const y = Number(el.getAttribute('cy'));
  el.dispatchEvent(ptr('pointerdown', x, y));
  window.dispatchEvent(ptr('pointermove', to.x, to.y));
  window.dispatchEvent(ptr('pointerup', to.x, to.y));
};

describe('viewport (FR-C1)', () => {
  it('wheel pinch zooms around cursor', () => {
    const before = ctrl.viewport;
    svg.dispatchEvent(
      new WheelEvent('wheel', { clientX: 400, clientY: 300, deltaY: -120, ctrlKey: true, cancelable: true }),
    );
    const after = ctrl.viewport;
    expect(after.k).toBeGreaterThan(before.k);
  });

  it('plain wheel pans', () => {
    const before = ctrl.viewport;
    svg.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 100, cancelable: true }));
    expect(ctrl.viewport.y).toBeLessThan(before.y);
  });

  it('zoom clamps to 400 %', () => {
    for (let i = 0; i < 30; i++) {
      svg.dispatchEvent(
        new WheelEvent('wheel', { clientX: 400, clientY: 300, deltaY: -120, ctrlKey: true, cancelable: true }),
      );
    }
    expect(ctrl.viewport.k).toBeLessThanOrEqual(4);
  });

  it('space+drag pans; arrows pan; 0 resets', () => {
    window.dispatchEvent(key('keydown', { key: ' ' }));
    svg.dispatchEvent(ptr('pointerdown', 100, 100));
    window.dispatchEvent(ptr('pointermove', 160, 140));
    window.dispatchEvent(ptr('pointerup', 160, 140));
    window.dispatchEvent(key('keyup', { key: ' ' }));
    expect(ctrl.viewport.x).toBe(60);
    expect(ctrl.viewport.y).toBe(40);

    window.dispatchEvent(key('keydown', { key: 'ArrowLeft' }));
    expect(ctrl.viewport.x).toBe(100);
    window.dispatchEvent(key('keydown', { key: '0' }));
    expect(ctrl.viewport).toEqual({ x: 0, y: 0, k: 1 });
  });
});

describe('selection + drag (FR-C2/C4)', () => {
  // system 160×60 centered at (280,230) → top-left (200,200)
  beforeEach(() => {
    ctrl.addObject('system', { x: 280, y: 230 });
    expect(obj('o1')).toMatchObject({ x: 200, y: 200, w: 160, h: 60 });
  });

  it('click selects object; empty click clears', () => {
    const c = center('o1');
    svg.dispatchEvent(ptr('pointerdown', c.x, c.y));
    window.dispatchEvent(ptr('pointerup', c.x, c.y));
    expect(ctrl.snapshot.selection.objects).toEqual(['o1']);
    svg.dispatchEvent(ptr('pointerdown', 10, 10));
    window.dispatchEvent(ptr('pointerup', 10, 10));
    expect(ctrl.snapshot.selection.objects).toEqual([]);
  });

  it('drag moves with grid snap and pushes one undo command', () => {
    const c = center('o1'); // (280,230)
    drag(c, { x: c.x + 10, y: c.y + 3 });
    expect(obj('o1').x).toBe(208); // 200+10 → snap(210) = 208
    expect(obj('o1').y).toBe(200); // 200+3 → snap(203) = 200
    expect(ctrl.undo.size).toBe(2); // add + move
    ctrl.undo.undo();
    expect(obj('o1').x).toBe(200);
    expect(obj('o1').y).toBe(200);
    expect(Number(GRID_SIZE)).toBe(8);
  });

  it('sub-threshold click does not push a move command', () => {
    const c = center('o1');
    const n = ctrl.undo.size;
    svg.dispatchEvent(ptr('pointerdown', c.x, c.y));
    window.dispatchEvent(ptr('pointermove', c.x + 1, c.y));
    window.dispatchEvent(ptr('pointerup', c.x + 1, c.y));
    expect(ctrl.undo.size).toBe(n);
  });

  it('alignment guide overrides grid snap (FR-C2)', () => {
    // o2 top-left at (500,400): center (580,430)
    ctrl.addObject('system', { x: 580, y: 430 });
    const c1 = center('o1'); // (280,230)
    // drag so o1's right edge (x+160) aligns to o2.x=500 → x=340 → dx=+140
    drag(c1, { x: c1.x + 140, y: c1.y + 70 });
    const o1 = obj('o1');
    expect(o1.x).toBe(340); // guide hit: exact alignment, no grid re-snap (grid would give 336/344)
    expect(o1.x + o1.w).toBe(500); // edge-aligned with o2.x
  });

  it('shift-click toggles multi-selection', () => {
    ctrl.addObject('system', { x: 580, y: 430 });
    const c1 = center('o1');
    svg.dispatchEvent(ptr('pointerdown', c1.x, c1.y));
    window.dispatchEvent(ptr('pointerup', c1.x, c1.y));
    const c2 = center('o2');
    svg.dispatchEvent(ptr('pointerdown', c2.x, c2.y, { shiftKey: true }));
    window.dispatchEvent(ptr('pointerup', c2.x, c2.y, { shiftKey: true }));
    expect(ctrl.snapshot.selection.objects.sort()).toEqual(['o1', 'o2']);
  });

  it('rubber band selects intersecting objects only', () => {
    ctrl.addObject('system', { x: 580, y: 430 }); // o2 at (500,400)..(660,460)
    drag({ x: 150, y: 150 }, { x: 600, y: 260 }); // covers o1, not o2 (y)
    expect(ctrl.snapshot.selection.objects).toEqual(['o1']);
  });
});

describe('link creation via halo (FR-C7)', () => {
  beforeEach(() => {
    ctrl.addObject('system', { x: 280, y: 230 }); // o1 (200,200)
    ctrl.addObject('system', { x: 580, y: 430 }); // o2 (500,400)
  });

  it('halo drag → ghost → commit an untyped link (F-08: no injected type)', () => {
    svg.dispatchEvent(ptr('pointerdown', center('o1').x, center('o1').y));
    window.dispatchEvent(ptr('pointerup', center('o1').x, center('o1').y));
    const halo = svg.querySelector('.pc-halo');
    if (!halo) throw new Error('no halo drawn');
    dragFromEl(halo, center('o2'));
    const links = ctrl.snapshot.links;
    expect(links).toHaveLength(1);
    expect(links[0]?.from).toBe('o1');
    expect(links[0]?.to).toBe('o2');
    expect(links[0]?.type).toBeUndefined();
    expect(svg.querySelectorAll('.pc-route')).toHaveLength(1);
    ctrl.undo.undo();
    expect(ctrl.snapshot.links).toHaveLength(0);
    ctrl.undo.redo();
    expect(ctrl.snapshot.links).toHaveLength(1);
  });

  it('ghost line visible during halo drag', () => {
    svg.dispatchEvent(ptr('pointerdown', center('o1').x, center('o1').y));
    window.dispatchEvent(ptr('pointerup', center('o1').x, center('o1').y));
    const halo = svg.querySelector('.pc-halo');
    if (!halo) throw new Error('no halo');
    const hx = Number(halo.getAttribute('cx'));
    const hy = Number(halo.getAttribute('cy'));
    halo.dispatchEvent(ptr('pointerdown', hx, hy));
    window.dispatchEvent(ptr('pointermove', 400, 300));
    expect(svg.querySelectorAll('.pc-ghost')).toHaveLength(1);
    window.dispatchEvent(ptr('pointerup', 400, 300));
    expect(ctrl.snapshot.links).toHaveLength(0);
  });

  it('clicking a route selects the link', () => {
    svg.dispatchEvent(ptr('pointerdown', center('o1').x, center('o1').y));
    window.dispatchEvent(ptr('pointerup', center('o1').x, center('o1').y));
    const halo = svg.querySelector('.pc-halo');
    if (!halo) throw new Error('no halo');
    dragFromEl(halo, center('o2'));
    const l = ctrl.snapshot.links[0];
    if (!l) throw new Error('no link');
    // horizontal-dominant route: (360,230) → channel x=430 → (500,430); click on channel
    svg.dispatchEvent(ptr('pointerdown', 430, 330));
    window.dispatchEvent(ptr('pointerup', 430, 330));
    expect(ctrl.snapshot.selection.links).toEqual([l.id]);
    expect(ctrl.snapshot.selection.objects).toEqual([]);
  });
});

describe('delete + undo/redo keys (FR-C9)', () => {
  beforeEach(() => {
    ctrl.addObject('system', { x: 280, y: 230 });
  });

  it('Delete removes selection; mod+z / mod+shift+z restore/re-delete', () => {
    const c = center('o1');
    svg.dispatchEvent(ptr('pointerdown', c.x, c.y));
    window.dispatchEvent(ptr('pointerup', c.x, c.y));
    window.dispatchEvent(key('keydown', { key: 'Delete' }));
    expect(ctrl.snapshot.objects).toHaveLength(0);
    window.dispatchEvent(key('keydown', { key: 'z', metaKey: true }));
    expect(ctrl.snapshot.objects).toHaveLength(1);
    window.dispatchEvent(key('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    expect(ctrl.snapshot.objects).toHaveLength(0);
  });

  it('typing in inputs does not trigger canvas keys', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(key('keydown', { key: 'Delete' }));
    expect(ctrl.snapshot.objects).toHaveLength(1);
    input.remove();
  });

  it('quick-add keys 1..9 place objects at view center (FR-C3)', () => {
    window.dispatchEvent(key('keydown', { key: '1' })); // person
    window.dispatchEvent(key('keydown', { key: '6' })); // datastore
    expect(ctrl.snapshot.objects.map((o) => o.kind)).toEqual(['system', 'person', 'datastore']);
    window.dispatchEvent(key('keydown', { key: 'Escape' }));
    expect(ctrl.snapshot.selection.objects).toEqual([]);
  });
});

describe('properties + grid + resize', () => {
  // group 320×240 centered at (260,220) → top-left (100,100)
  beforeEach(() => {
    ctrl.addObject('group', { x: 260, y: 220 });
    expect(obj('o1')).toMatchObject({ x: 100, y: 100, w: 320, h: 240 });
  });

  it('updateObject patches fields with undo (FR-C6)', () => {
    ctrl.updateObject('o1', { name: 'Payments', technology: 'Java' });
    expect(obj('o1').name).toBe('Payments');
    ctrl.undo.undo();
    expect(obj('o1').name).not.toBe('Payments');
  });

  it('updateObject label text reaches the DOM', () => {
    ctrl.updateObject('o1', { name: 'Payments' });
    expect(svg.querySelector('g[data-id="o1"] text')?.textContent).toBe('Payments');
  });

  it('grid toggles (FR-C2)', () => {
    expect(ctrl.toggleGrid()).toBe(true);
    expect(ctrl.toggleGrid()).toBe(false);
  });

  it('group resize via corner handle snaps far edge, anchors top-left (FR-C4)', () => {
    const c = center('o1');
    svg.dispatchEvent(ptr('pointerdown', c.x, c.y));
    window.dispatchEvent(ptr('pointerup', c.x, c.y));
    // F-13: eight anchors — the corner drag uses the south-east one
    const handle = svg.querySelector('.pc-resize-handle[data-handle="se"]');
    if (!handle) throw new Error('no se resize handle for group');
    // handle at (420,340); move +13,+5 → x2 snap(433)=432, y2 snap(345)=344
    dragFromEl(handle, { x: 433, y: 345 });
    const o = obj('o1');
    expect(o.x).toBe(100); // anchored
    expect(o.w).toBe(332);
    expect(o.h).toBe(244);
    ctrl.undo.undo();
    expect(obj('o1').w).toBe(320);
  });
});

describe('link visual model (F-12)', () => {
  const seed = (): void => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' },
        { id: 'o2', kind: 'system', x: 300, y: 0, w: 160, h: 60, name: 'B' },
      ],
      links: [{ id: 'L1', from: 'o1', to: 'o2' }],
    });
  };

  it('Shift+A cycles the selected link head through the marker shapes', () => {
    seed();
    ctrl.setSelection([], ['L1']);
    const heads: string[] = [];
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(key('keydown', { key: 'A', shiftKey: true }));
      heads.push(ctrl.snapshot.links[0]?.head ?? 'arrow');
    }
    expect(heads).toEqual(['open', 'diamond', 'circle']);
  });

  it('Shift+A is undoable as one command per press', () => {
    seed();
    ctrl.setSelection([], ['L1']);
    window.dispatchEvent(key('keydown', { key: 'A', shiftKey: true }));
    expect(ctrl.snapshot.links[0]?.head).toBe('open');
    ctrl.undo.undo();
    expect(ctrl.snapshot.links[0]?.head).toBeUndefined();
  });

  it('renders the marker for the selected head/tail model', () => {
    seed();
    ctrl.updateLink('L1', { head: 'diamond', tail: 'circle', line: 'dotted', width: 3 });
    const path = svg.querySelector('g.pc-link[data-id="L1"] path.pc-route')!;
    expect(path.getAttribute('marker-end')).toBe('url(#pc-marker-diamond)');
    expect(path.getAttribute('marker-start')).toBe('url(#pc-marker-circle)');
    expect(path.getAttribute('stroke-width')).toBe('3');
    expect(svg.querySelector('g.pc-link[data-id="L1"]')!.classList.contains('pc-dotted')).toBe(true);
  });

  it('applies per-link route modes to the rendered path', () => {
    seed();
    ctrl.loadState({
      objects: ctrl.snapshot.objects,
      links: ctrl.snapshot.links.map((l) => ({ ...l, waypoints: [[150, 100]] })),
    });
    ctrl.updateLink('L1', { route: 'curved' });
    expect(svg.querySelector('g.pc-link[data-id="L1"] path.pc-route')!.getAttribute('d')).toContain(' C ');
    ctrl.updateLink('L1', { route: 'straight' });
    expect(svg.querySelector('g.pc-link[data-id="L1"] path.pc-route')!.getAttribute('d')).not.toContain(' C ');
  });
});

describe('C4 boundary routing', () => {
  it('routes through a containing boundary instead of treating it as a solid obstacle', () => {
    ctrl.loadState({
      objects: [
        { id: 'a', kind: 'person', x: 0, y: 100, w: 120, h: 72, size: { w: 120, h: 72 } },
        { id: 'b', kind: 'container', x: 300, y: 106, w: 160, h: 60, size: { w: 160, h: 60 } },
        { id: 'boundary', kind: 'group', x: 130, y: 40, w: 60, h: 180, size: { w: 60, h: 180 } },
      ],
      links: [{ id: 'L1', from: 'a', to: 'b' }],
    });
    const path = svg.querySelector('g.pc-link[data-id="L1"] path.pc-route')!;
    expect(path.getAttribute('d')?.match(/L/g)).toHaveLength(1);
  });
});

describe('clipboard + alignment (F-19)', () => {
  const seed = (): void => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 100, y: 100, w: 160, h: 60, name: 'A' },
        { id: 'o2', kind: 'system', x: 400, y: 200, w: 160, h: 60, name: 'B' },
      ],
      links: [{ id: 'L1', from: 'o1', to: 'o2' }],
    });
  };

  it('copy + paste remaps ids and keeps the internal link', () => {
    seed();
    ctrl.setSelection(['o1', 'o2'], ['L1']);
    expect(ctrl.copySelected()).toBe(true);
    const pasted = ctrl.pasteCopied();
    expect(pasted).toHaveLength(2);
    const ids = ctrl.snapshot.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // four unique ids
    const links = ctrl.snapshot.links;
    expect(links).toHaveLength(2);
    const copy = links.find((l) => !['L1'].includes(l.id))!;
    expect(pasted).toContain(copy.from);
    expect(pasted).toContain(copy.to);
    ctrl.undo.undo();
    expect(ctrl.snapshot.objects).toHaveLength(2);
  });

  it('duplicate never reuses an id, even repeated', () => {
    seed();
    ctrl.setSelection(['o1']);
    ctrl.duplicateSelected();
    ctrl.duplicateSelected();
    const ids = ctrl.snapshot.objects.map((o) => o.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('align left is one undoable command', () => {
    seed();
    ctrl.setSelection(['o1', 'o2']);
    ctrl.alignSelected('left');
    expect(ctrl.snapshot.objects.map((o) => o.x)).toEqual([100, 100]);
    ctrl.undo.undo();
    expect(ctrl.snapshot.objects.map((o) => o.x).sort()).toEqual([100, 400]);
  });

  it('equal size gives both objects the largest box', () => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 0, y: 0, w: 100, h: 60 },
        { id: 'o2', kind: 'system', x: 200, y: 0, w: 200, h: 40 },
      ],
      links: [],
    });
    ctrl.setSelection(['o1', 'o2']);
    ctrl.equalSizeSelected();
    expect(ctrl.snapshot.objects.map((o) => [o.w, o.h])).toEqual([[200, 60], [200, 60]]);
  });
});

describe('waypoint dragging (F-19)', () => {
  beforeEach(() => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' },
        { id: 'o2', kind: 'system', x: 400, y: 200, w: 160, h: 60, name: 'B' },
      ],
      links: [{ id: 'L1', from: 'o1', to: 'o2', waypoints: [[200, 120]] }],
    });
  });

  it('exposes drag handles for the selected link and moves the waypoint', () => {
    ctrl.setSelection([], ['L1']);
    const handle = svg.querySelector('.pc-waypoint');
    expect(handle).not.toBeNull();
    expect(handle!.getAttribute('data-wp-index')).toBe('0');

    dragFromEl(handle as Element, { x: 260, y: 160 });
    const wp = ctrl.snapshot.links[0]?.waypoints?.[0];
    expect(wp).toBeDefined();
    expect(wp![0]).not.toBe(200); // moved
    // snapped to the 8 px grid
    expect(wp![0] % 8).toBe(0);
    expect(wp![1] % 8).toBe(0);
  });

  it('the waypoint drag is one undoable command', () => {
    ctrl.setSelection([], ['L1']);
    const handle = svg.querySelector('.pc-waypoint') as Element;
    dragFromEl(handle, { x: 260, y: 160 });
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]).not.toEqual([200, 120]);
    ctrl.undo.undo();
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]).toEqual([200, 120]);
  });
});

describe('keyboard object navigation (F-22)', () => {
  beforeEach(() => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 0, y: 0, w: 100, h: 60, name: 'A' },
        { id: 'o2', kind: 'system', x: 400, y: 0, w: 100, h: 60, name: 'B' },
        { id: 'o3', kind: 'system', x: 0, y: 300, w: 100, h: 60, name: 'C' },
      ],
      links: [],
    });
  });

  it('scene nodes are reachable: role, tabindex and an accessible label', () => {
    const el = svg.querySelector('g.pc-obj[data-id="o1"]')!;
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('-1');
    expect(el.getAttribute('aria-label')).toBe('system A');
  });

  it('Tab roves focus through the objects and selects them', () => {
    window.dispatchEvent(key('keydown', { key: 'Tab' }));
    expect(ctrl.snapshot.selection.objects).toEqual(['o1']);
    window.dispatchEvent(key('keydown', { key: 'Tab' }));
    expect(ctrl.snapshot.selection.objects).toEqual(['o2']);
    window.dispatchEvent(key('keydown', { key: 'Tab', shiftKey: true }));
    expect(ctrl.snapshot.selection.objects).toEqual(['o1']);
  });

  it('arrow keys pick the nearest object in that direction', () => {
    ctrl.focusObject('o1');
    window.dispatchEvent(key('keydown', { key: 'ArrowRight' }));
    expect(ctrl.snapshot.selection.objects).toEqual(['o2']);
    ctrl.focusObject('o1');
    window.dispatchEvent(key('keydown', { key: 'ArrowDown' }));
    expect(ctrl.snapshot.selection.objects).toEqual(['o3']);
  });

  it('F2 renames the focused object (routed through the rename request)', () => {
    const requested: string[] = [];
    const c2 = new CanvasController(svg, { onRenameRequest: (id) => requested.push(id) });
    c2.loadState({
      objects: [{ id: 'o9', kind: 'system', x: 0, y: 0, w: 100, h: 60, name: 'Z' }],
      links: [],
    });
    c2.setSelection(['o9']);
    window.dispatchEvent(key('keydown', { key: 'F2' }));
    expect(requested).toEqual(['o9']);
    c2.destroy();
  });
});

describe('state notifications', () => {
  it('onState fires on mutations', () => {
    const spy = vi.fn();
    const c2 = new CanvasController(svg, { onState: spy });
    c2.addObject('note', { x: 50, y: 50 });
    expect(spy).toHaveBeenCalled();
    c2.destroy();
  });
});

describe('M6 session fade + positions (FR-V1/V2/V3)', () => {
  it('setFaded applies pc-faded classes without emitting state or touching undo', () => {
    ctrl.addObject('system', { x: 10, y: 10 });
    const id = ctrl.snapshot.objects[0]!.id;
    const before = snapshots.length;
    ctrl.setFaded([id], []);
    expect(svg.querySelector('g.pc-obj')?.classList.contains('pc-faded')).toBe(true);
    expect(snapshots.length).toBe(before); // visual only — no state emit
    ctrl.setFaded([], []);
    expect(svg.querySelector('g.pc-obj')?.classList.contains('pc-faded')).toBe(false);
  });

  it('applyPositions moves objects + recomputes routes, not undoable, not persisted', () => {
    ctrl.addObject('system', { x: 10, y: 10 });
    ctrl.addObject('datastore', { x: 300, y: 200 });
    const [a, b] = ctrl.snapshot.objects.map((o) => o.id);
    const undoDepthBefore = ctrl.undo.size;
    ctrl.applyPositions({ [a!]: { x: 500, y: 400 }, [b!]: { x: 40, y: 20 } });
    const o1 = obj(a!);
    expect({ x: o1.x, y: o1.y }).toEqual({ x: 500, y: 400 });
    expect(obj(b!).y).toBe(20);
    expect(snapshots.length).toBeGreaterThan(0); // re-render emits (session state)
    const undoDepthAfter = ctrl.undo.size;
    expect(undoDepthAfter).toBe(undoDepthBefore); // not undoable
  });

  it('currentPositions returns top-left coords keyed by id', () => {
    ctrl.addObject('system', { x: 15, y: 25 });
    const id = ctrl.snapshot.objects[0]!.id;
    expect(ctrl.currentPositions()[id]).toEqual({ x: obj(id).x, y: obj(id).y });
  });

  it('applyPositions ignores unknown ids', () => {
    ctrl.addObject('system', { x: 15, y: 25 });
    const id = ctrl.snapshot.objects[0]!.id;
    ctrl.applyPositions({ ghost: { x: 1, y: 1 } });
    expect(obj(id).x).not.toBe(1);
  });

  it('reveal paints the selection immediately (search/deps jump, M6)', () => {
    ctrl.addObject('system', { x: 15, y: 25 });
    const id = ctrl.snapshot.objects[0]!.id;
    ctrl.reveal(id);
    const g = svg.querySelector(`g.pc-obj[data-id="${id}"]`);
    expect(g?.classList.contains('pc-selected')).toBe(true); // rendered now
    const world = svg.querySelector('.pc-world')?.getAttribute('transform');
    expect(world).not.toBe('translate(0 0) scale(1)'); // camera centered
    ctrl.reveal('ghost'); // unknown id: no-op, selection untouched
    expect(svg.querySelector(`g.pc-obj[data-id="${id}"]`)?.classList.contains('pc-selected')).toBe(true);
  });
});
