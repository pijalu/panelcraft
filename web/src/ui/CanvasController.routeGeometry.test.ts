// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Item 13: a route is only correct as a *whole* polyline. Endpoint checks alone
// let a connector cut through the shapes it belongs to, so these tests assert
// every segment, the label's box, and the authored-waypoint contract on the two
// fixtures from the bug report:
//
//   A. the automatic `Shop → Payment provider` route of the C4 template, and
//   B. the same document with the two authored bends that dive into the payment
//      entity — the detour must survive, the invalid bend must not be drawn.
//
// The rectangles are the ones the report measured on screen: Shop 57×36 at
// (248, 128), Payment provider 160×60 at (348, 52), Customer 120×72 at (40, 40).
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CanvasController, type DiagramState } from './CanvasController';
import type { Point, Rect } from '../engine/render/viewport';
import { contentBox } from '../engine/render/shapes';
import type { SceneObject } from '../engine/render/shapes';

const SVG_NS = 'http://www.w3.org/2000/svg';

const APP: Rect = { x: 248, y: 128, w: 57, h: 36 };
const PAY: Rect = { x: 348, y: 52, w: 160, h: 60 };
const USER: Rect = { x: 40, y: 40, w: 120, h: 72 };

const OBJECTS: DiagramState['objects'] = [
  { id: 'user', kind: 'person', x: USER.x, y: USER.y, w: USER.w, h: USER.h, name: 'Customer' },
  {
    id: 'app', kind: 'system', x: APP.x, y: APP.y, w: APP.w, h: APP.h, name: 'Shop',
    size: { w: APP.w, h: APP.h },
  },
  { id: 'pay', kind: 'system_ext', x: PAY.x, y: PAY.y, w: PAY.w, h: PAY.h, name: 'Payment provider' },
];

const LINKS: DiagramState['links'] = [
  { id: 'L1', from: 'user', to: 'app', label: 'buys' },
  { id: 'L2', from: 'app', to: 'pay', label: 'charges' },
];

/** Fixture A: the template as drawn, every route automatic. */
const AUTOMATIC: DiagramState = { objects: OBJECTS, links: LINKS };

/** Fixture B: the authored detour, including the bend inside the target. */
const AUTHORED: DiagramState = {
  objects: OBJECTS,
  links: [
    LINKS[0]!,
    { ...LINKS[1]!, waypoints: [[432, 254], [432, 70]] },
  ],
};

let svg: SVGSVGElement;
let ctrl: CanvasController;

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(svg);
  ctrl = new CanvasController(svg, { onState: () => {} });
});

afterEach(() => {
  ctrl.destroy();
  svg.remove();
});

const state = (doc: DiagramState): DiagramState => doc;

/** Strict interior: the perimeter belongs to the shape, its inside does not. */
function inside(p: Point, r: Rect): boolean {
  return p.x > r.x + 1e-6 && p.x < r.x + r.w - 1e-6 && p.y > r.y + 1e-6 && p.y < r.y + r.h - 1e-6;
}

/** True when any part of the segment spends length inside the rectangle. */
function segmentInside(a: Point, b: Point, r: Rect): boolean {
  const steps = 200;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r)) return true;
  }
  return false;
}

function crossings(points: Point[], rects: Rect[]): Rect[] {
  return rects.filter((r) => points.slice(1).some((p, i) => segmentInside(points[i]!, p, r)));
}

function pathLength(points: Point[]): number {
  return points.slice(1).reduce((sum, p, i) =>
    sum + Math.abs(p.x - points[i]!.x) + Math.abs(p.y - points[i]!.y), 0);
}

function reversals(points: Point[]): number {
  let total = 0;
  for (const axis of ['x', 'y'] as const) {
    let sign = 0;
    for (let i = 1; i < points.length; i++) {
      const step = Math.sign(points[i]![axis] - points[i - 1]![axis]);
      if (step === 0) continue;
      if (sign !== 0 && step !== sign) total++;
      sign = step;
    }
  }
  return total;
}

/** The label rectangle painted for a link (what a reader actually sees). */
function labelRect(id: string): Rect {
  const bg = svg.querySelector(`g.pc-link-label-group[data-id="${id}"] rect.pc-link-label-bg`);
  if (!bg) throw new Error(`no label box for ${id}`);
  return {
    x: Number(bg.getAttribute('x')),
    y: Number(bg.getAttribute('y')),
    w: Number(bg.getAttribute('width')),
    h: Number(bg.getAttribute('height')),
  };
}

function rectOverlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function rectToRoute(box: Rect, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    for (let s = 0; s <= 40; s++) {
      const t = s / 40;
      best = Math.min(best, distanceToRect({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, box));
    }
  }
  return best;
}

/** Entity label box of one object, from the same model the renderer lays out. */
function entityLabel(obj: SceneObject): Rect {
  const box = contentBox(obj);
  return {
    x: obj.x + box.label.left, y: obj.y + box.label.top,
    w: box.label.right - box.label.left, h: box.label.bottom - box.label.top,
  };
}

const scene = (id: string): SceneObject => OBJECTS.find((o) => o.id === id) as unknown as SceneObject;

function route(id: string): Point[] {
  const points = ctrl.snapshot.routes?.[id];
  if (!points) throw new Error(`no route for ${id}`);
  return points;
}

describe('item 13: whole-polyline route validation', () => {
  it('fixture A: the automatic Shop → Payment provider route is clean end to end', () => {
    ctrl.loadState(state(AUTOMATIC));
    const points = route('L2');

    // Expected geometry of the fix: out of Shop's right side, one channel, into
    // the payment provider's left side. Asserted as a whole, not just endpoints.
    expect(points).toEqual([
      { x: 305, y: 146 }, { x: 326.5, y: 146 }, { x: 326.5, y: 82 }, { x: 348, y: 82 },
    ]);

    // Axis-aligned, no duplicate points.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(a).not.toEqual(b);
    }

    // Endpoints sit on their entity perimeters, and the first/last legs leave
    // and enter perpendicularly (outward from the endpoints, not along them).
    expect(inside(points[0]!, APP)).toBe(false);
    expect(inside(points.at(-1)!, PAY)).toBe(false);
    expect(points[0]).toEqual({ x: APP.x + APP.w, y: APP.y + APP.h / 2 });
    expect(points.at(-1)).toEqual({ x: PAY.x, y: PAY.y + PAY.h / 2 });
    expect(points[1]!.y).toBe(points[0]!.y);
    expect(points.at(-2)!.y).toBe(points.at(-1)!.y);

    // No entity interior — including the third-party person and both labels.
    expect(crossings(points, [APP, PAY, USER])).toEqual([]);
    expect(crossings(points, [entityLabel(scene('app')), entityLabel(scene('pay')),
      entityLabel(scene('user'))])).toEqual([]);

    // Readable: the shortest orthogonal path, no reversal, no loop above both.
    expect(pathLength(points)).toBe(107);
    expect(reversals(points)).toBe(0);
  });

  it('fixture B: the authored out-and-back detour is simplified', () => {
    ctrl.loadState(state(AUTHORED));
    const points = route('L2');

    // Both authored bends are skipped: the first makes the whole path turn
    // back on itself, the second sits inside the target. The result is the
    // clean automatic route, not the authored down-and-back shape.
    expect(points).toEqual([
      { x: 305, y: 146 }, { x: 326.5, y: 146 }, { x: 326.5, y: 82 }, { x: 348, y: 82 },
    ]);
    expect(crossings(points, [APP, PAY, USER])).toEqual([]);
    expect(crossings(points, [entityLabel(scene('pay')), entityLabel(scene('app'))])).toEqual([]);
    expect(points[0]).toEqual({ x: APP.x + APP.w, y: APP.y + APP.h / 2 });
    expect(points.at(-1)).toEqual({ x: PAY.x, y: PAY.y + PAY.h / 2 });
    expect(reversals(points)).toBe(0);
    // The source text is still the user's, in authored order.
    expect(ctrl.snapshot.links.find((l) => l.id === 'L2')?.waypoints)
      .toEqual([[432, 254], [432, 70]]);
  });

  it('fixture C: an intentional detour survives without a warning', () => {
    ctrl.loadState(state({
      objects: [
        { id: 'from', kind: 'system', x: 0, y: 0, w: 100, h: 60,
          size: { w: 100, h: 60 }, name: 'From' },
        { id: 'blocker', kind: 'system', x: 180, y: 0, w: 40, h: 200,
          size: { w: 40, h: 200 }, name: 'Blocker' },
        { id: 'to', kind: 'system', x: 400, y: 200, w: 100, h: 60,
          size: { w: 100, h: 60 }, name: 'To' },
      ],
      links: [{ id: 'L3', from: 'from', to: 'to', label: 'around', waypoints: [[200, 220]] }],
    }));
    const points = route('L3');
    expect(points).toContainEqual({ x: 200, y: 220 });
    expect(reversals(points)).toBe(0);
    expect(ctrl.snapshot.routeWarnings?.L3).toBeUndefined();
    expect(ctrl.snapshot.links[0]?.waypoints).toEqual([[200, 220]]);
  });

  it('fixture B: both skipped bends are diagnosed in plain words', () => {
    ctrl.loadState(state(AUTHORED));
    const warnings = ctrl.snapshot.routeWarnings ?? {};
    expect(warnings.L2).toEqual([
      'charges: bend 1 at (432, 254) is skipped because it makes the route reverse direction.',
      'charges: bend 2 at (432, 70) is inside Payment provider — the route skips it.',
    ]);
    // The document is untouched: the authored points are still the user's.
    expect(ctrl.snapshot.links.find((l) => l.id === 'L2')?.waypoints).toEqual([[432, 254], [432, 70]]);

    // And the canvas says so where the reader is looking.
    const group = svg.querySelector('g.pc-link[data-id="L2"]');
    expect(group?.getAttribute('data-route-warning')).toBe(warnings.L2!.join(' '));
    expect(group?.getAttribute('aria-description')).toBe(warnings.L2!.join(' '));
  });

  it('both fixtures place the "charges" label beside its own route', () => {
    for (const doc of [AUTOMATIC, AUTHORED]) {
      ctrl.loadState(state(doc));
      const points = route('L2');
      const box = labelRect('L2');
      // Owns a place next to its connector: within one label gap of its line…
      expect(rectToRoute(box, points)).toBeLessThanOrEqual(24);
      // …and covers no entity, no entity label and no other link.
      expect([APP, PAY, USER].some((r) => rectOverlaps(box, r))).toBe(false);
      expect([entityLabel(scene('app')), entityLabel(scene('pay')),
        entityLabel(scene('user'))].some((r) => rectOverlaps(box, r))).toBe(false);
      expect(route('L1').some((p) => distanceToRect(p, box) === 0)).toBe(false);
      const buys = labelRect('L1');
      expect(rectOverlaps(box, buys)).toBe(false);
    }
  });

  it('keeps routes clean for nearby, stacked and reordered entities', () => {
    const stacked: DiagramState = {
      objects: [
        { id: 'a', kind: 'system', x: 100, y: 100, w: 160, h: 60, name: 'A' },
        { id: 'b', kind: 'system', x: 100, y: 180, w: 160, h: 60, name: 'B' },
        { id: 'c', kind: 'system', x: 100, y: 260, w: 160, h: 60, name: 'C' },
        { id: 'd', kind: 'system', x: 300, y: 180, w: 160, h: 60, name: 'D' },
      ],
      links: [
        { id: 'S1', from: 'a', to: 'c', label: 'skips b' },
        { id: 'S2', from: 'c', to: 'd', label: 'sideways' },
      ],
    };
    ctrl.loadState(state(stacked));
    const rects = stacked.objects.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
    for (const link of ['S1', 'S2']) {
      const points = route(link);
      expect(crossings(points, rects)).toEqual([]);
    }
    // The re-ordered third-party entity never becomes an endpoint.
    expect(crossings(route('S1'), [rects[1]!])).toEqual([]);
  });

  it('start/end anchors stay authoritative and stay clean', () => {
    ctrl.loadState(state({
      objects: OBJECTS,
      links: [{ ...LINKS[1]!, fromAnchor: 0.25, toAnchor: 0.25 }],
    }));
    const points = route('L2');
    // `0.25` is the far corner of the right side: the route starts and ends
    // exactly there, not at the automatic port centre.
    expect(points[0]).toEqual({ x: APP.x + APP.w, y: APP.y });
    expect(points.at(-1)).toEqual({ x: PAY.x + PAY.w, y: PAY.y });
    expect(crossings(points, [APP, PAY, USER])).toEqual([]);
    expect(crossings(points, [entityLabel(scene('pay'))])).toEqual([]);
  });
});
