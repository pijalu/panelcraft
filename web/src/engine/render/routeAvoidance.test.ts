// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { routeLink } from './router';
import type { Point, Rect } from './viewport';

function box(x: number, y: number, w = 60, h = 60): Rect {
  return { x, y, w, h };
}

function cross(a: Point, b: Point, c: Point, d: Point): boolean {
  const direction = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return direction(a, b, c) * direction(a, b, d) < 0 &&
    direction(c, d, a) * direction(c, d, b) < 0;
}

function intersectsSolid(points: Point[], rect: Rect): boolean {
  return points.slice(1).some((point, index) => {
    const previous = points[index]!;
    return cross(previous, point, { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }) ||
      cross(previous, point, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }) ||
      cross(previous, point, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }) ||
      cross(previous, point, { x: rect.x, y: rect.y + rect.h }, { x: rect.x, y: rect.y }) ||
      (point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.h);
  });
}

describe('CX-02 best-effort link avoidance', () => {
  it('routes an ordinary link around an intervening solid object', () => {
    const routed = routeLink({
      from: box(20, 100), to: box(500, 100),
      obstacles: [box(250, 80, 80, 100)],
    });
    expect(intersectsSolid(routed, box(250, 80, 80, 100))).toBe(false);
  });

  it('reconsiders a legacy detour that crosses a second solid object', () => {
    const obstacles = [box(250, 80, 80, 100), box(350, 170, 80, 100)];
    const routed = routeLink({ from: box(20, 100), to: box(500, 100), obstacles });
    expect(intersectsSolid(routed, obstacles[0]!)).toBe(false);
    expect(intersectsSolid(routed, obstacles[1]!)).toBe(false);
  });

  it('avoids an existing connector route and is deterministic', () => {
    const input = {
      from: box(100, 160), to: box(400, 160),
      routes: [{ id: 'existing', points: [{ x: 160, y: 190 }, { x: 400, y: 190 }] }],
    };
    const first = routeLink(input);
    const second = routeLink(input);
    expect(first).toEqual(second);
    expect(first).not.toEqual(input.routes[0]);
    expect(first.some((point) => point.y !== 190)).toBe(true);
  });

  it('separates coincident links on opposite sides of an object', () => {
    const obstacles = [box(280, 80, 100, 100)];
    const from = box(40, 100, 160, 60);
    const to = box(520, 100, 160, 60);
    const first = routeLink({ from, to, obstacles });
    const second = routeLink({
      from, to, obstacles,
      routes: [{ id: 'first', points: first }],
    });
    expect(second).not.toEqual(first);
    expect(intersectsSolid(second, obstacles[0]!)).toBe(false);
    expect(second.some((point) => point.y === 56)).toBe(true);
  });

  it('separates coincident non-aligned links with opposite endpoint legs', () => {
    const obstacles = [box(280, 80, 100, 100)];
    const from = box(40, 160, 160, 60);
    const to = box(520, 100, 160, 60);
    const first = routeLink({ from, to, obstacles });
    const second = routeLink({ from, to, obstacles, routes: [{ id: 'first', points: first }] });
    expect(second).not.toEqual(first);
    expect(intersectsSolid(second, obstacles[0]!)).toBe(false);
    expect(second).toEqual([
      { x: 200, y: 190 }, { x: 212, y: 190 }, { x: 212, y: 204 },
      { x: 508, y: 204 }, { x: 508, y: 130 }, { x: 520, y: 130 },
    ]);
  });

  it('allows a per-link overlap exception for objects and routes', () => {
    const routed = routeLink({
      from: box(20, 100), to: box(500, 100), allowOverlap: true,
      obstacles: [box(250, 80, 80, 100)],
      routes: [{ id: 'existing', points: [{ x: 200, y: 80 }, { x: 200, y: 180 }] }],
    });
    expect(routed).toHaveLength(2);
  });

  it('keeps an authored waypoint authoritative over automatic avoidance', () => {
    // The waypoint is outside every entity, so the user's detour wins over the
    // shorter automatic route — and the leg bends around the obstacle.
    const routed = routeLink({
      from: box(20, 100), to: box(500, 100),
      waypoints: [[280, 250]],
      obstacles: [box(250, 80, 80, 100)],
      routes: [{ id: 'existing', points: [{ x: 200, y: 80 }, { x: 200, y: 180 }] }],
    });
    expect(routed).toContainEqual({ x: 280, y: 250 });
    expect(intersectsSolid(routed, box(250, 80, 80, 100))).toBe(false);
  });

  it('keeps shared endpoints and falls back deterministically when no clear route exists', () => {
    const routed = routeLink({
      from: box(20, 100), to: box(500, 100),
      routes: [{ id: 'shared', points: [{ x: 80, y: 130 }, { x: 500, y: 130 }] }],
      obstacles: [box(0, 0, 1000, 300)],
    });
    expect(routed[0]).toEqual({ x: 80, y: 130 });
    expect(routed.at(-1)).toEqual({ x: 500, y: 130 });
  });

  it('bounds candidate work for dense route sets', () => {
    const routes = Array.from({ length: 32 }, (_, index) => ({
      id: `L${index}`,
      points: [{ x: 80, y: 50 + index * 8 }, { x: 700, y: 50 + index * 8 }],
    }));
    const start = performance.now();
    const routed = routeLink({ from: box(20, 120), to: box(750, 120), routes });
    expect(performance.now() - start).toBeLessThan(1500);
    expect(routed[0]).toEqual({ x: 80, y: 150 });
  });
});
