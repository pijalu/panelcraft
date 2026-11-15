// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { layoutLinkLabels } from './labelLayout';
import type { SceneLink } from './scenegraph';

const objects = [
  { id: 'a', kind: 'system' as const, x: 0, y: 70, w: 100, h: 60 },
  { id: 'b', kind: 'system' as const, x: 400, y: 70, w: 100, h: 60 },
];

const horizontal: SceneLink = {
  id: 'read',
  label: 'Reads and writes',
  points: [{ x: 100, y: 100 }, { x: 400, y: 100 }],
};

describe('link label collision avoidance', () => {
  it('keeps an unobstructed label at its stable route anchor', () => {
    const placed = layoutLinkLabels({ objects, links: [horizontal] }).get('read');
    expect(placed?.point).toEqual({ x: 250, y: 100 });
  });

  it('moves a label away from an unrelated crossing route and objects', () => {
    const crossing: SceneLink = {
      id: 'charge',
      points: [{ x: 250, y: 50 }, { x: 250, y: 200 }],
    };
    const placed = layoutLinkLabels({ objects, links: [horizontal, crossing] }).get('read');
    expect(placed).toBeDefined();
    expect(placed?.point).not.toEqual({ x: 250, y: 100 });
    expect(250 < placed!.rect.x || 250 > placed!.rect.x + placed!.rect.w).toBe(true);
    for (const object of objects) {
      const intersects = placed!.rect.x <= object.x + object.w &&
        placed!.rect.x + placed!.rect.w >= object.x &&
        placed!.rect.y <= object.y + object.h &&
        placed!.rect.y + placed!.rect.h >= object.y;
      expect(intersects).toBe(false);
    }
  });

  it('separates labels that would overlap each other', () => {
    const second: SceneLink = { ...horizontal, id: 'second', label: 'Writes' };
    const placements = layoutLinkLabels({ objects, links: [horizontal, second] });
    const a = placements.get('read')!.rect;
    const b = placements.get('second')!.rect;
    const overlaps = a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
    expect(overlaps).toBe(false);
  });
});

describe('label placement quality (UX08-WP10)', () => {
  /** A wide blocker covering the route midpoint: every ±36 px offset collides. */
  const blocker = [
    ...objects,
    { id: 'wall', kind: 'system' as const, x: 200, y: 55, w: 120, h: 90 },
  ];

  it('never leaves a label painted beneath an object', () => {
    const placed = layoutLinkLabels({ objects: blocker, links: [horizontal] }).get('read')!;
    expect(placed).toBeDefined();
    const covered = blocker.some((o) =>
      placed.rect.x <= o.x + o.w && placed.rect.x + placed.rect.w >= o.x &&
      placed.rect.y <= o.y + o.h && placed.rect.y + placed.rect.h >= o.y);
    expect(covered).toBe(false);
  });

  it('keeps the label associated with its route and within reach of it', () => {
    const placed = layoutLinkLabels({ objects: blocker, links: [horizontal] }).get('read')!;
    // Still anchored to the same route, just further along it.
    const near = Math.hypot(placed.anchor.x - 100, placed.anchor.y - 100) <= 300 ||
      Math.hypot(placed.anchor.x - 400, placed.anchor.y - 100) <= 300;
    expect(near).toBe(true);
    expect(placed.anchor.y).toBe(100);
  });

  it('wraps long text to a bounded width and keeps every word', () => {
    const long: SceneLink = {
      id: 'long',
      label: 'Subscribes to order events and republishes fulfilment updates downstream',
      points: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
    };
    const placed = layoutLinkLabels({ objects, links: [long] }).get('long')!;
    expect(placed.lines.length).toBeGreaterThan(1);
    expect(placed.lines.length).toBeLessThanOrEqual(3);
    // Nothing is silently dropped: the full content is preserved for AT/export.
    expect(placed.text).toBe(long.label);
    expect(placed.lines.join(' ')).toBe(long.label);
    expect(placed.rect.w).toBeLessThanOrEqual(200);
  });

  it('uses the injected measurer, not a character count', () => {
    const wide = { measure: () => ({ w: 199, h: 16 }) };
    const placed = layoutLinkLabels(
      { objects, links: [horizontal] },
      { measure: wide, maxWidth: 240 },
    ).get('read')!;
    expect(placed.rect.w).toBeGreaterThanOrEqual(199);
  });

  it('marks a leader only when the label is displaced from its route', () => {
    const close = layoutLinkLabels({ objects, links: [horizontal] }).get('read')!;
    expect(close.leader).toBe(false);
    const displaced = layoutLinkLabels({ objects: blocker, links: [horizontal] }).get('read')!;
    expect(displaced.leader).toBe(true);
  });

  it('is deterministic and breaks ties in route order', () => {
    const scene = { objects: blocker, links: [horizontal, { ...horizontal, id: 'z', label: 'Z' }] };
    const a = layoutLinkLabels(scene).get('read')!;
    const b = layoutLinkLabels(scene).get('read')!;
    expect(a).toEqual(b);
    expect(layoutLinkLabels(scene).get('read')).toEqual(a);
  });
});

describe('label placement across route geometry (UX08-WP10)', () => {
  /** A curve that bulges through `bulge`, which is solid scenery. */
  const curved: SceneLink = {
    id: 'curved',
    label: 'Emits events',
    route: 'curved',
    points: [{ x: 100, y: 400 }, { x: 250, y: 320 }, { x: 400, y: 400 }],
  };
  const bulge = [
    { id: 'a', kind: 'system' as const, x: 0, y: 370, w: 100, h: 60 },
    { id: 'b', kind: 'system' as const, x: 400, y: 370, w: 100, h: 60 },
    { id: 'wall', kind: 'system' as const, x: 200, y: 300, w: 100, h: 80 },
  ];
  const covers = (rect: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }): boolean =>
    rect.x <= o.x + o.w && rect.x + rect.w >= o.x && rect.y <= o.y + o.h && rect.y + rect.h >= o.y;

  it('slides a label off a blocker sitting on a curved route', () => {
    const placed = layoutLinkLabels({ objects: bulge, links: [curved] }).get('curved')!;
    expect(covers(placed.rect, bulge[2]!)).toBe(false);
    // Still attached to the curve rather than banished to the far side of the map.
    expect(Math.hypot(placed.point.x - placed.anchor.x, placed.point.y - placed.anchor.y))
      .toBeLessThanOrEqual(90);
    // The anchor is a point of the sampled curve, not a chord approximation.
    expect(placed.anchor.y).toBeLessThan(400);
    expect(placed.anchor.y).toBeGreaterThan(300);
  });

  it('places labels on straight diagonal routes too', () => {
    const diagonal: SceneLink = {
      id: 'diag',
      label: 'Reads',
      route: 'straight',
      points: [{ x: 100, y: 100 }, { x: 500, y: 300 }],
    };
    const wall = [
      { id: 'a', kind: 'system' as const, x: 40, y: 60, w: 60, h: 60 },
      { id: 'b', kind: 'system' as const, x: 500, y: 260, w: 60, h: 60 },
      { id: 'wall', kind: 'system' as const, x: 240, y: 160, w: 120, h: 80 },
    ];
    const placed = layoutLinkLabels({ objects: wall, links: [diagonal] }).get('diag')!;
    expect(covers(placed.rect, wall[2]!)).toBe(false);
    expect(placed.anchor).not.toEqual({ x: 300, y: 200 });
  });
});

describe('label placement inside the diagram frame (UX08-WP10)', () => {
  // A route that runs along the very top edge of the diagram: a label centred on
  // it would stick out above every object, where fit-to-view cannot show it.
  const edgeObjects = [
    { id: 'a', kind: 'system' as const, x: 0, y: 0, w: 100, h: 60 },
    { id: 'b', kind: 'system' as const, x: 400, y: 0, w: 100, h: 60 },
  ];
  const topRun: SceneLink = {
    id: 'top',
    label: 'Reports',
    points: [{ x: 100, y: 0 }, { x: 400, y: 0 }],
  };

  it('keeps a label inside the diagram frame instead of hanging off the edge', () => {
    const frame = { x: 0, y: 0, w: 500, h: 60 };
    const placed = layoutLinkLabels({ objects: edgeObjects, links: [topRun] }).get('top')!;
    expect(placed.rect.y).toBeGreaterThanOrEqual(frame.y);
    expect(placed.rect.y + placed.rect.h).toBeLessThanOrEqual(frame.y + frame.h);
    // Still on its own route, just on the inward side of it.
    expect(placed.anchor.y).toBe(frame.y);
  });
});
