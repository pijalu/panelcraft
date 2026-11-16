// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP09: pure route-editing geometry. Everything the canvas needs to bend a
// connection — segments, apex handles, insert/delete/move and canonicalisation —
// without touching the router or the document format.
import { describe, expect, it } from 'vitest';
import {
  apexes,
  canonicalize,
  channels,
  clampChannelSlide,
  deleteBend,
  insertBend,
  materialize,
  moveBend,
  moveChannel,
  moveSegment,
  segments,
  snapChannel,
  splitSegment,
} from './routeEditing';
import type { Point } from './viewport';

const p = (x: number, y: number): Point => ({ x, y });
/** A left-to-right route with one dogleg: a → b (down) → c (right). */
const dogleg: Point[] = [p(0, 0), p(100, 0), p(100, 80), p(300, 80)];

/** True when every segment is axis-aligned (the orthogonal contract). */
const isOrthogonal = (points: Point[]): boolean =>
  points.every((point, i) => {
    const next = points[i + 1];
    return next === undefined || point.x === next.x || point.y === next.y;
  });

describe('route segments (UX08-WP09)', () => {
  it('reports each segment with its axis, midpoint and both ends', () => {
    const list = segments(dogleg);
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.axis)).toEqual(['h', 'v', 'h']);
    expect(list[0]).toMatchObject({ index: 0, mid: p(50, 0), a: p(0, 0), b: p(100, 0) });
    expect(list[1]!.mid).toEqual(p(100, 40));
  });

  it('marks a segment interior only when both of its ends can move', () => {
    // The first and last segments touch the entities, so only the middle one can
    // slide sideways without detaching a connection.
    expect(segments(dogleg).map((s) => s.editable)).toEqual([false, true, false]);
  });

  it('exposes apex handles for interior vertices only', () => {
    expect(apexes(dogleg).map((a) => a.index)).toEqual([1, 2]);
    expect(apexes([p(0, 0), p(10, 0)]).map((a) => a.index)).toEqual([]);
  });
});

describe('inserting a bend', () => {
  it('splits a segment into a draggable dogleg with two coincident points', () => {
    const out = insertBend(dogleg, 0, p(40, 0));
    expect(out).toEqual([p(0, 0), p(40, 0), p(40, 0), p(100, 0), p(100, 80), p(300, 80)]);
    expect(isOrthogonal(out)).toBe(true);
    // the two new points are an apex pair the user can pull apart
    expect(apexes(out).map((a) => a.index)).toEqual([1, 2, 3, 4]);
  });

  it('projects the pointer onto the segment so the insert stays aligned', () => {
    const out = insertBend(dogleg, 1, p(120, 30)); // vertical segment: x is fixed
    expect(out.slice(2, 4)).toEqual([p(100, 30), p(100, 30)]);
  });

  it('splits a straight two-point route and ignores an unknown segment', () => {
    // Inserting on the first segment of a plain straight link is the normal way
    // to give it a bend, so a two-point route is editable.
    const straight = insertBend([p(0, 0), p(50, 0)], 0, p(20, 0));
    expect(straight).toHaveLength(4);
    expect(isOrthogonal(straight)).toBe(true);
    expect(insertBend(dogleg, 9, p(0, 0))).toEqual(dogleg);
  });
});

describe('moving geometry', () => {
  it('slides an interior segment perpendicular to itself, keeping it orthogonal', () => {
    const moved = moveSegment(dogleg, 1, 25);
    expect(moved).toEqual([p(0, 0), p(125, 0), p(125, 80), p(300, 80)]);
    expect(isOrthogonal(moved!)).toBe(true);
    // endpoints are semantic: they must never move
    expect(moved![0]).toEqual(dogleg[0]);
    expect(moved!.at(-1)).toEqual(dogleg.at(-1));
  });

  it('refuses to slide a segment that owns an endpoint', () => {
    expect(moveSegment(dogleg, 0, 10)).toBeNull();
    expect(moveSegment(dogleg, 2, 10)).toBeNull();
  });

  it('moves one apex freely and deletes it again', () => {
    const moved = moveBend(dogleg, 1, p(130, 10));
    expect(moved[1]).toEqual(p(130, 10));
    const removed = deleteBend(dogleg, 2);
    expect(removed).toEqual([p(0, 0), p(100, 0), p(300, 80)]);
  });

  it('never deletes an endpoint', () => {
    expect(deleteBend(dogleg, 0)).toEqual(dogleg);
    expect(deleteBend(dogleg, dogleg.length - 1)).toEqual(dogleg);
  });
});

describe('canonicalisation', () => {
  it('drops duplicate and collinear points but keeps the ends', () => {
    const messy: Point[] = [p(0, 0), p(50, 0), p(50, 0), p(100, 0), p(100, 80)];
    expect(canonicalize(messy)).toEqual([p(0, 0), p(100, 0), p(100, 80)]);
  });

  it('keeps a genuine corner', () => {
    expect(canonicalize(dogleg)).toEqual(dogleg);
  });

  it('is idempotent and deterministic', () => {
    const once = canonicalize([p(0, 0), p(10, 0), p(20, 0), p(20, 30)]);
    expect(canonicalize(once)).toEqual(once);
    expect(canonicalize([p(0, 0), p(10, 0), p(20, 0), p(20, 30)])).toEqual(once);
  });

  it('materialises a rendered route as storable waypoints', () => {
    // Only the interior vertices are stored; the ends belong to the entities.
    expect(materialize(dogleg)).toEqual([p(100, 0), p(100, 80)]);
    expect(materialize([p(0, 0), p(10, 0)])).toEqual([]);
    expect(materialize(dogleg).map((w) => [w.x, w.y])).toEqual([[100, 0], [100, 80]]);
  });

  it('never stores a route endpoint as a waypoint', () => {
    // The collinear run 0,50 → 0,80 → 0,120 collapses under canonicalise; the
    // slice must use the canonicalised length, or the target anchor (100,120)
    // leaks into the document as a user waypoint and pins the arrow head.
    const route = [p(0, 0), p(0, 50), p(0, 80), p(0, 120), p(100, 120)];
    expect(materialize(route)).toEqual([p(0, 120)]);
  });
});

describe('channel snapping (UX08-WP09)', () => {
  // Two entities the user can line a channel up with: edges and centres are the
  // corner / side-midpoint positions a diagram author actually wants.
  const rects = [
    { x: 0, y: 0, w: 100, h: 60 }, // rows at y = 0, 30, 60; cols at x = 0, 50, 100
    { x: 200, y: 140, w: 100, h: 60 }, // rows at y = 140, 170, 200
  ];

  it('snaps a horizontal channel to a side midpoint', () => {
    // 32 is 2px from the first rect's centre line (y = 30).
    expect(snapChannel(32, 'h', rects, 4)).toEqual({ value: 30, snapped: true });
  });

  it('snaps a horizontal channel to a corner row', () => {
    expect(snapChannel(196, 'h', rects, 6)).toEqual({ value: 200, snapped: true });
  });

  it('snaps a vertical channel on the x axis', () => {
    expect(snapChannel(96, 'v', rects, 6)).toEqual({ value: 100, snapped: true });
  });

  it('ignores lines outside the threshold', () => {
    expect(snapChannel(120, 'h', rects, 4)).toEqual({ value: 120, snapped: false });
  });

  it('picks the closest of two competing lines', () => {
    // y = 30 (distance 2) beats y = 0 (distance 28) and y = 60 (distance 32).
    expect(snapChannel(28, 'h', rects, 40).value).toBe(30);
  });

  it('is identity when there is nothing to snap to', () => {
    expect(snapChannel(31, 'h', [], 8)).toEqual({ value: 31, snapped: false });
  });

  it('does not snap exactly at the threshold edge but does just inside it', () => {
    expect(snapChannel(34, 'h', rects, 4)).toEqual({ value: 30, snapped: true });
    expect(snapChannel(34.5, 'h', rects, 4)).toEqual({ value: 34.5, snapped: false });
  });
});

describe('bend insertion (UX08-WP09)', () => {
  it('splits a segment at the pointer, projected onto the segment', () => {
    // Pointer is below the segment (y = 130) — the new bend still lands on it.
    expect(splitSegment(dogleg, 0, p(40, 130))).toEqual([p(0, 0), p(40, 0), p(100, 0), p(100, 80), p(300, 80)]);
  });

  it('keeps both ends and every existing vertex', () => {
    const split = splitSegment(dogleg, 2, p(200, 84));
    expect(split).toEqual([p(0, 0), p(100, 0), p(100, 80), p(200, 80), p(300, 80)]);
  });

  it('splits a straight two-point route', () => {
    expect(splitSegment([p(0, 0), p(100, 0)], 0, p(50, 3))).toEqual([p(0, 0), p(50, 0), p(100, 0)]);
  });

  it('is a no-op for an out-of-range segment', () => {
    expect(splitSegment(dogleg, 9, p(0, 0))).toEqual(dogleg);
  });
});

describe('channels: collinear runs and doubled-back legs (UX08-WP09)', () => {
  /** a → step down → step right → b, with the vertical run split in two. */
  const split: Point[] = [
    p(0, 0), p(100, 0), p(100, 60), p(100, 120), p(300, 120),
  ];

  it('collapses consecutive collinear segments into one channel', () => {
    const list = channels(split);
    // horizontal, vertical (two segments), horizontal
    expect(list.map((c) => [c.from, c.to, c.axis])).toEqual([
      [0, 0, 'h'], [1, 2, 'v'], [3, 3, 'h'],
    ]);
  });

  it('leaves a vertical run split by a waypoint a single slidable channel', () => {
    const list = channels(split);
    const vertical = list.filter((c) => c.axis === 'v');
    expect(vertical).toHaveLength(1);
    expect(vertical[0]?.at).toBe(100);
    expect(vertical[0]?.editable).toBe(true);
  });

  it('reports a leg that doubles back as one channel, not two handles', () => {
    // The router emits a "go down to the waypoint and come back" spike.
    const spike: Point[] = [p(0, 0), p(100, 0), p(100, 80), p(100, 0), p(200, 0)];
    const vertical = channels(spike).filter((c) => c.axis === 'v');
    expect(vertical).toHaveLength(1);
    expect(vertical[0]?.from).toBe(1);
    expect(vertical[0]?.to).toBe(2);
  });

  it('refuses a channel whose run owns a route endpoint', () => {
    // A two-point route has exactly one channel, and it owns both ends.
    expect(channels([p(0, 0), p(100, 0)])[0]?.editable).toBe(false);
  });

  it('slides a whole run, keeping the route orthogonal and the ends fixed', () => {
    const moved = moveChannel(split, 1, 40)!;
    expect(moved).toEqual([
      p(0, 0), p(140, 0), p(140, 60), p(140, 120), p(300, 120),
    ]);
    expect(isOrthogonal(moved)).toBe(true);
    expect(moved[0]).toEqual(split[0]);
    expect(moved.at(-1)).toEqual(split.at(-1));
  });

  it('refuses to slide an endpoint channel', () => {
    expect(moveChannel([p(0, 0), p(100, 0)], 0, 10)).toBeNull();
  });

    it('is a no-op for an unknown channel index', () => {
      expect(moveChannel(split, 9, 10)).toBeNull();
    });
  });

  describe('channel slide clamping (no legs through endpoints)', () => {
    // Z-route: A's right port (100,30) → channel → B's left port (400,230).
    const z: Point[] = [p(100, 30), p(250, 30), p(250, 230), p(400, 230)];

    it('slides freely inside the corridor between the ports', () => {
      expect(clampChannelSlide(z, 1, 200)).toBe(200);
    });

    it('stops the channel at the source port instead of reversing the first leg', () => {
      // Sliding left of x = 100 would send the first leg back through A.
      expect(clampChannelSlide(z, 1, 40)).toBe(100);
    });

    it('stops the channel at the target port instead of reversing the last leg', () => {
      expect(clampChannelSlide(z, 1, 500)).toBe(400);
    });

    it('leaves middle channels alone — they own no endpoint leg', () => {
      const wide: Point[] = [p(100, 30), p(200, 30), p(200, 100), p(300, 100), p(300, 230), p(400, 230)];
      expect(clampChannelSlide(wide, 2, 10)).toBe(10);
    });

    it('does not clamp when the exit leg is degenerate (zero length)', () => {
      const stub: Point[] = [p(100, 30), p(100, 30), p(250, 30), p(250, 230), p(400, 230)];
      expect(clampChannelSlide(stub, 2, 40)).toBe(40);
    });

    it('clamps a horizontal channel against vertical port lines', () => {
      // Vertical Z: A's bottom port → channel → B's top port.
      const vz: Point[] = [p(50, 60), p(50, 150), p(450, 150), p(450, 200)];
      expect(clampChannelSlide(vz, 1, 20)).toBe(60); // not above A's port
      expect(clampChannelSlide(vz, 1, 400)).toBe(200); // not below B's port
    });
  });
