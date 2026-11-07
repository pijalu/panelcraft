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

  it('halo drag → ghost → commit link with default type uses', () => {
    svg.dispatchEvent(ptr('pointerdown', center('o1').x, center('o1').y));
    window.dispatchEvent(ptr('pointerup', center('o1').x, center('o1').y));
    const halo = svg.querySelector('.pc-halo');
    if (!halo) throw new Error('no halo drawn');
    dragFromEl(halo, center('o2'));
    const links = ctrl.snapshot.links;
    expect(links).toHaveLength(1);
    expect(links[0]?.from).toBe('o1');
    expect(links[0]?.to).toBe('o2');
    expect(links[0]?.type).toBe('uses');
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
    const handle = svg.querySelector('.pc-resize-handle');
    if (!handle) throw new Error('no resize handle for group');
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

describe('state notifications', () => {
  it('onState fires on mutations', () => {
    const spy = vi.fn();
    const c2 = new CanvasController(svg, { onState: spy });
    c2.addObject('note', { x: 50, y: 50 });
    expect(spy).toHaveBeenCalled();
    c2.destroy();
  });
});
