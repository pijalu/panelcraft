// SPDX-License-Identifier: GPL-3.0-only
// Explicit orthogonal waypoints: one pure planner returns the drawn polyline and
// the authored bends it skipped, with a reason. The helpers below keep three
// different geometry facts separate: a whole-path reversal, a literal retrace
// and an entity crossing are not synonyms.
import { describe, expect, it } from 'vitest';
import { crossingEntities, planLink, routeOrtho, type Polyline, type RouteInput } from './router';
import type { Point } from './viewport';

const A = { x: 248, y: 128, w: 57, h: 36 };
const B = { x: 348, y: 52, w: 160, h: 60 };
const USER = { x: 40, y: 40, w: 120, h: 72 };
const SHOP_PAY: RouteInput = { from: A, to: B, obstacles: [USER] };

/** The polyline the report measured for the two authored bends, after the
 *  whole-route crossing fix: `(305,146) → (432,146) → (432,254) → (336,254) →
 *  (336,82) → (348,82)`. No segment retraces another, yet the x direction
 *  reverses at `(432,254)` and again at `(336,254)`. The second authored bend
 *  `(432,70)` is also inside the payment entity. */
const REPORTED_POLYLINE: Polyline = [
  { x: 305, y: 146 }, { x: 432, y: 146 }, { x: 432, y: 254 },
  { x: 336, y: 254 }, { x: 336, y: 82 }, { x: 348, y: 82 },
];
const REPORTED_INPUT: RouteInput = {
  ...SHOP_PAY,
  waypoints: [[432, 254], [432, 70]],
};

/** Direction changes along one axis, ignoring zero-length steps. */
function fullPathReversals(points: Polyline): number {
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

/** Consecutive segments that walk back along the same line — stricter than a
 *  reversal, because a perpendicular elbow in between breaks the retrace. */
function retraces(points: Polyline): number {
  let total = 0;
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!;
    const b = points[i - 1]!;
    const c = points[i]!;
    const before = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    const after = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
    if (before.x === -after.x && before.y === -after.y && (before.x !== 0 || before.y !== 0)) total++;
  }
  return total;
}

/** Strict-interior segment crossings, independent of the router's own test. */
function entityCrossings(points: Polyline, rects: typeof A[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    for (const rect of rects) {
      for (let s = 1; s < 100; s++) {
        const t = s / 100;
        const p: Point = {
          x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * t,
          y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * t,
        };
        if (p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) {
          total++;
          s = 100;
        }
      }
    }
  }
  return total;
}

describe('explicit orthogonal route plan', () => {
  it('simplifies the exact reported out-and-back polyline and explains both skipped bends', () => {
    // The report measured exactly REPORTED_POLYLINE for this input. The two
    // horizontal direction flips are the visible out-and-back; this stricter
    // helper also counts the vertical flip. No segment retraces or crosses an
    // entity, so whole-candidate scoring is required.
    expect(fullPathReversals(REPORTED_POLYLINE)).toBe(3);
    expect(retraces(REPORTED_POLYLINE)).toBe(0);

    const plan = planLink(REPORTED_INPUT);
    expect(plan.points).toEqual([
      { x: 305, y: 146 }, { x: 326.5, y: 146 }, { x: 326.5, y: 82 }, { x: 348, y: 82 },
    ]);
    expect(fullPathReversals(plan.points)).toBe(0);
    expect(retraces(plan.points)).toBe(0);
    expect(entityCrossings(plan.points, [A, B, USER])).toBe(0);
    expect(plan.skips).toEqual([
      { reason: 'causes-reversal', index: 0, point: { x: 432, y: 254 } },
      { reason: 'inside-entity', index: 1, point: { x: 432, y: 70 }, rect: B },
    ]);
    // The authored document is never the planner's output.
    expect(REPORTED_INPUT.waypoints).toEqual([[432, 254], [432, 70]]);
  });

  it('keeps an intentional detour that crosses nothing and reverses nothing', () => {
    const obstacle = { x: 180, y: 0, w: 40, h: 200 };
    const input: RouteInput = {
      from: { x: 0, y: 0, w: 100, h: 60 },
      to: { x: 400, y: 200, w: 100, h: 60 },
      obstacles: [obstacle],
      waypoints: [[200, 220]],
    };
    const plan = planLink(input);
    expect(plan.skips).toEqual([]);
    expect(plan.points).toEqual(routeOrtho(input));
    expect(plan.points).toContainEqual({ x: 200, y: 220 });
    expect(fullPathReversals(plan.points)).toBe(0);
    expect(entityCrossings(plan.points, [input.from, input.to, obstacle])).toBe(0);
  });

  it('a sole authored bend is an intentional detour even when it reverses', () => {
    const input: RouteInput = { ...SHOP_PAY, waypoints: [[432, 254]] };
    const plan = planLink(input);
    expect(plan.skips).toEqual([]);
    expect(plan.points).toContainEqual({ x: 432, y: 254 });
    expect(fullPathReversals(plan.points)).toBeGreaterThan(0);
  });

  it('drops only the authored bends needed to remove reversals', () => {
    const input: RouteInput = {
      ...SHOP_PAY,
      waypoints: [[432, 254], [432, 300], [500, 300], [500, 82]],
    };
    const plan = planLink(input);
    expect(fullPathReversals(plan.points)).toBe(0);
    expect(entityCrossings(plan.points, [A, B, USER])).toBe(0);
    expect(plan.skips.map((skip) => skip.index)).toEqual([0, 1, 2, 3]);
    expect(plan.skips.map((skip) => skip.reason)).toEqual([
      'causes-reversal', 'causes-reversal', 'causes-reversal', 'inside-entity',
    ]);
  });

  it('treats a duplicate bend as removable without mutating the authored list', () => {
    const authored: [number, number][] = [[432, 254], [432, 254]];
    const plan = planLink({ ...SHOP_PAY, waypoints: authored });
    expect(fullPathReversals(plan.points)).toBe(0);
    expect(plan.skips.length).toBeGreaterThan(0);
    expect(authored).toEqual([[432, 254], [432, 254]]);
    expect(crossingEntities(plan.points, { ...SHOP_PAY, waypoints: authored })).toEqual([]);
  });

  it('keeps a clean authored route unchanged', () => {
    const input: RouteInput = { ...SHOP_PAY, waypoints: [[326.5, 100]] };
    const plan = planLink(input);
    expect(plan.skips).toEqual([]);
    expect(fullPathReversals(plan.points)).toBe(0);
    expect(plan.points).toContainEqual({ x: 326.5, y: 100 });
  });

  it('never increases crossings when an authored bend is the only barrier', () => {
    const obstacle = { x: 300, y: 100, w: 100, h: 40 };
    const input: RouteInput = {
      from: { x: 0, y: 0, w: 100, h: 60 },
      to: { x: 500, y: 160, w: 100, h: 60 },
      obstacles: [obstacle],
      waypoints: [[450, 250], [450, 20]],
    };
    const plan = planLink(input);
    expect(entityCrossings(plan.points, [input.from, input.to, obstacle])).toBe(0);
    expect(crossingEntities(plan.points, input)).toEqual([]);
  });

  it('bounds a many-bend plan deterministically', () => {
    const waypoints: [number, number][] = Array.from({ length: 32 }, (_, i) =>
      [i % 2 === 0 ? 200 : 600, 100 + i * 12] as [number, number]);
    const input: RouteInput = {
      from: { x: 0, y: 0, w: 100, h: 60 },
      to: { x: 700, y: 500, w: 100, h: 60 },
      waypoints,
    };
    const started = performance.now();
    const first = planLink(input);
    const elapsed = performance.now() - started;
    expect(planLink(input)).toEqual(first);
    // The work bound is what this test is about: the plan must not grow with the
    // obstacles the planner could inspect. The wall-clock ceiling is only a guard
    // against pathological blow-up — it used to be 500 ms, which is a claim about
    // the machine rather than the planner, and failed on a loaded runner at 556 ms.
    expect(first.points.length).toBeLessThanOrEqual(waypoints.length + 8);
    expect(elapsed).toBeLessThan(10_000);
    expect(fullPathReversals(first.points)).toBeLessThanOrEqual(fullPathReversals(routeOrtho(input)));
  });
});
