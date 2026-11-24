// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP09 connection editing: segment slides, bend insertion/deletion,
// keyboard nudges, snapping and rollback. The pure geometry is covered by
// routeEditing.test.ts; this file proves the controller wiring — handles in the
// overlay, one undo entry per gesture and no geometry invented on a non-edit.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from './CanvasController';

const SVG_NS = 'http://www.w3.org/2000/svg';

let svg: SVGSVGElement;
let ctrl: CanvasController;

function stubRect(): void {
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
}

function ptr(
  type: string,
  x: number,
  y: number,
  opts: Partial<MouseEventInit> = {},
): MouseEvent {
  return new MouseEvent(type, {
    clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, ...opts,
  });
}

const key = (k: string, init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });

/** Pointerdown at the centre of an overlay handle, then drag to `to`. */
function dragHandle(el: Element, to: { x: number; y: number }, opts: Partial<MouseEventInit> = {}): void {
  const rectX = el.getAttribute('x');
  const x = rectX === null
    ? Number(el.getAttribute('cx'))
    : Number(rectX) + Number(el.getAttribute('width')) / 2;
  const y = rectX === null
    ? Number(el.getAttribute('cy'))
    : Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2;
  el.dispatchEvent(ptr('pointerdown', x, y));
  window.dispatchEvent(ptr('pointermove', to.x, to.y, opts));
  window.dispatchEvent(ptr('pointerup', to.x, to.y, opts));
}

const segment = (): Element | null => svg.querySelector('.pc-segment');
const bend = (i = 0): Element | null => svg.querySelector(`.pc-waypoint[data-wp-index="${i}"]`);
const routePath = (): string =>
  svg.querySelector('g.pc-link[data-id="L1"] path.pc-route')?.getAttribute('d') ?? '';

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  stubRect();
  document.body.appendChild(svg);
  ctrl = new CanvasController(svg, { onState: () => {} });
});

afterEach(() => {
  ctrl.destroy();
  svg.remove();
});

/**
 * A is above-left of B, so the automatic orthogonal route is a Z with one
 * slidable vertical channel at x = 280 (both of its ends are interior).
 */
function loadPair(link: Partial<{ waypoints: [number, number][]; label: string }> = {}): void {
  ctrl.loadState({
    objects: [
      { id: 'a', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' },
      { id: 'b', kind: 'system', x: 400, y: 200, w: 160, h: 60, name: 'B' },
    ],
    links: [{ id: 'L1', from: 'a', to: 'b', ...link }],
  });
  ctrl.setSelection([], ['L1']);
}

describe('segment handles (UX08-WP09)', () => {
  beforeEach(() => loadPair());

  it('offers one handle per slidable channel and none on an endpoint segment', () => {
    const handles = svg.querySelectorAll('.pc-segment');
    // The Z route has three segments; only the middle one is interior/interior.
    expect(handles).toHaveLength(1);
    expect(segment()?.getAttribute('data-seg-axis')).toBe('v');
    expect(segment()?.getAttribute('data-link')).toBe('L1');
    // 9 px hit target with keyboard semantics (Fitts's law + a11y).
    expect(segment()?.getAttribute('width')).toBe('9');
    expect(segment()?.getAttribute('tabindex')).toBe('0');
  });

  it('uses the painted label bounds to keep the editing handle legible', () => {
    loadPair({ label: 'test' });
    const label = svg.querySelector('.pc-link-label-group[data-id="L1"] .pc-link-label-bg')!;
    const handle = segment()!;
    const labelBox = {
      x: Number(label.getAttribute('x')), y: Number(label.getAttribute('y')),
      w: Number(label.getAttribute('width')), h: Number(label.getAttribute('height')),
    };
    const handleBox = {
      x: Number(handle.getAttribute('x')), y: Number(handle.getAttribute('y')),
      w: Number(handle.getAttribute('width')), h: Number(handle.getAttribute('height')),
    };
    const overlaps = labelBox.x < handleBox.x + handleBox.w && labelBox.x + labelBox.w > handleBox.x &&
      labelBox.y < handleBox.y + handleBox.h && labelBox.y + labelBox.h > handleBox.y;
    expect(overlaps).toBe(false);
    expect(Number(handle.getAttribute('x')) + handleBox.w / 2).toBe(280);
    expect(svg.querySelectorAll('.pc-segment')).toHaveLength(1);
  });

  it('slides the channel and materialises waypoints without moving endpoints', () => {
    const undoBefore = ctrl.undo.size;
    dragHandle(segment()!, { x: 320, y: 130 });
    expect(ctrl.snapshot.links[0]?.waypoints).toEqual([[320, 30], [320, 230]]);
    expect(ctrl.undo.size).toBe(undoBefore + 1);
    // Both semantic endpoints keep their port positions.
    expect(routePath()).toContain('M 160 30');
    expect(routePath()).toMatch(/400 230$/);
  });

  it('keeps the handle node across a click, so a second click pairs into a dblclick', () => {
    // The browser only fires `dblclick` when both clicks hit the SAME element:
    // repainting the overlay on a no-op pointerup would silently disable the
    // double-click-to-add-bend gesture.
    const handle = segment()!;
    handle.dispatchEvent(ptr('pointerdown', 280, 130));
    window.dispatchEvent(ptr('pointerup', 280, 130));
    expect(segment()).toBe(handle);
  });

  it('a click with no movement adds nothing to an automatic route', () => {
    segment()!.dispatchEvent(ptr('pointerdown', 280, 130));
    window.dispatchEvent(ptr('pointerup', 280, 130));
    expect(ctrl.snapshot.links[0]?.waypoints).toBeUndefined();
    expect(ctrl.undo.size).toBe(0);
  });

  it('Alt suspends snapping for the gesture', () => {
    // 315 is 5 px off the 8 px grid and off every entity line.
    dragHandle(segment()!, { x: 315, y: 130 }, { altKey: true });
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]?.[0]).toBe(315);
  });

  it('snaps the channel to an entity edge before the grid does', () => {
    // A blocker at x = 300 contributes lines at 300/330/360. Dropping the
    // channel at 297 is 3 px from its left edge but 9 px off the nearest grid
    // line — the entity wins, which is the whole point of the snap.
    loadPair();
    ctrl.loadState({
      objects: [
        { id: 'a', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' },
        { id: 'b', kind: 'system', x: 400, y: 200, w: 160, h: 60, name: 'B' },
        { id: 'c', kind: 'system', x: 300, y: 0, w: 60, h: 60, name: 'C' },
      ],
      links: [{ id: 'L1', from: 'a', to: 'b' }],
    });
    ctrl.setSelection([], ['L1']);
    dragHandle(segment()!, { x: 297, y: 130 });
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]?.[0]).toBe(300);
  });

  it('Escape restores the route the gesture started from', () => {
    const el = segment()!;
    el.dispatchEvent(ptr('pointerdown', 280, 130));
    window.dispatchEvent(ptr('pointermove', 340, 130));
    expect(ctrl.snapshot.links[0]?.waypoints).toBeDefined();
    window.dispatchEvent(key('Escape'));
    expect(ctrl.snapshot.links[0]?.waypoints).toBeUndefined();
    expect(ctrl.undo.size).toBe(0);
  });
});

describe('bend insertion (UX08-WP09)', () => {
  beforeEach(() => loadPair());

  it('double-click adds a draggable bend under the pointer', () => {
    segment()!.dispatchEvent(new MouseEvent('dblclick', {
      clientX: 280, clientY: 135, bubbles: true, cancelable: true,
    }));
    expect(ctrl.snapshot.links[0]?.waypoints).toEqual([[280, 30], [280, 135], [280, 230]]);
    expect(svg.querySelectorAll('.pc-waypoint')).toHaveLength(3);
    expect(ctrl.undo.size).toBe(1);
  });
});

describe('keyboard route editing (UX08-WP09)', () => {
  beforeEach(() => loadPair({ waypoints: [[280, 120]] }));

  it('arrow keys nudge a focused bend by one grid cell, Shift by one unit', () => {
    (bend() as SVGElement).focus();
    window.dispatchEvent(key('ArrowDown'));
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]).toEqual([280, 128]);
    window.dispatchEvent(key('ArrowRight', { shiftKey: true }));
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]).toEqual([281, 128]);
  });

  it('Delete removes the focused bend and keeps links intact', () => {
    (bend() as SVGElement).focus();
    window.dispatchEvent(key('Delete'));
    expect(ctrl.snapshot.links[0]?.waypoints).toBeUndefined();
    expect(ctrl.snapshot.links).toHaveLength(1);
    expect(ctrl.undo.size).toBeGreaterThan(0);
  });

  it('undo restores a deleted bend', () => {
    (bend() as SVGElement).focus();
    window.dispatchEvent(key('Delete'));
    ctrl.undo.undo();
    expect(ctrl.snapshot.links[0]?.waypoints).toEqual([[280, 120]]);
  });

  it('a focused segment slides with the perpendicular arrow key only', () => {
    (segment() as SVGElement).focus();
    window.dispatchEvent(key('ArrowDown')); // wrong axis for a vertical segment
    expect(ctrl.snapshot.links[0]?.waypoints).toEqual([[280, 120]]);
    window.dispatchEvent(key('ArrowLeft'));
    expect(ctrl.snapshot.links[0]?.waypoints?.[0]?.[0]).toBe(272);
  });
});

describe('route reset commands (UX08-WP09)', () => {
  beforeEach(() => loadPair({ waypoints: [[280, 120]] }));

  it('Reset route clears bends and both endpoint anchors in one undo entry', () => {
    ctrl.setLinkAnchor('L1', 'from', 0.125);
    const undoBefore = ctrl.undo.size;
    ctrl.resetLinkRoute('L1');
    const link = ctrl.snapshot.links[0]!;
    expect(link.waypoints).toBeUndefined();
    expect(link.fromAnchor).toBeUndefined();
    expect(ctrl.undo.size).toBe(undoBefore + 1);
    ctrl.undo.undo();
    expect(ctrl.snapshot.links[0]?.waypoints).toEqual([[280, 120]]);
    expect(ctrl.snapshot.links[0]?.fromAnchor).toBe(0.125);
  });

  it('Reset bends keeps the endpoint anchors', () => {
    ctrl.setLinkAnchor('L1', 'to', 0.5);
    ctrl.resetLinkBends('L1');
    expect(ctrl.snapshot.links[0]?.waypoints).toBeUndefined();
    expect(ctrl.snapshot.links[0]?.toAnchor).toBe(0.5);
  });

  it('Start/End anchors are settable and clearable (Auto)', () => {
    ctrl.setLinkAnchor('L1', 'from', 0.25);
    expect(ctrl.snapshot.links[0]?.fromAnchor).toBe(0.25);
    ctrl.setLinkAnchor('L1', 'from', undefined);
    expect(ctrl.snapshot.links[0]?.fromAnchor).toBeUndefined();
  });
});
