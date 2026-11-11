// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { routeLabelPoint, routeToPath, sampleRoute } from './routePath';

const points = [{ x: 80, y: 20 }, { x: 300, y: 120 }];

describe('route path geometry', () => {
  it('keeps straight and orthogonal output as line commands', () => {
    expect(routeToPath(points, 'straight')).toBe('M 80 20 L 300 120');
    expect(routeToPath(points, 'orthogonal')).toBe('M 80 20 L 300 120');
  });

  it('renders a curved route as a deterministic cubic path', () => {
    expect(routeToPath(points, 'curved')).toBe(
      'M 80 20 C 179 20 201 120 300 120',
    );
  });

  it('samples curves for hit-testing and places labels on the curve', () => {
    const sampled = sampleRoute(points, 'curved');
    expect(sampled.length).toBeGreaterThan(2);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points[1]);
    expect(routeLabelPoint(points, 'curved')).toEqual({ x: 190, y: 70 });
  });

  it('passes curved routes through explicit waypoints', () => {
    const withWaypoint = [{ x: 0, y: 0 }, { x: 100, y: 80 }, { x: 200, y: 0 }];
    const sampled = sampleRoute(withWaypoint, 'curved');
    expect(sampled.some((p) => p.x === 100 && p.y === 80)).toBe(true);
  });
});
