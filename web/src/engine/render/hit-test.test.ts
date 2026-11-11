// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  pointInRect,
  rectsIntersect,
  hitObject,
  hitObjects,
  objectsInBand,
  hitLink,
  pick,
  LINK_HIT_SLOP_PX,
} from './hit-test';
import type { SceneObject } from './shapes';
import type { SceneLink } from './scenegraph';

const obj = (id: string, x: number, y: number, w = 80, h = 40, kind: SceneObject['kind'] = 'system'): SceneObject => ({
  id,
  kind,
  x,
  y,
  w,
  h,
});

const link = (id: string, points: SceneLink['points']): SceneLink => ({ id, points });

describe('point/rect primitives', () => {
  it('pointInRect is inclusive on edges', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(pointInRect({ x: 0, y: 0 }, r)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true);
    expect(pointInRect({ x: 11, y: 5 }, r)).toBe(false);
    expect(pointInRect({ x: -1, y: 5 }, r)).toBe(false);
  });

  it('rectsIntersect touches count, containment counts', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsIntersect(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(true); // edge touch
    expect(rectsIntersect(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
    expect(rectsIntersect(a, { x: 2, y: 2, w: 3, h: 3 })).toBe(true); // contained
  });
});

describe('object hits with z-order (FR-C4)', () => {
  const scene = [obj('bottom', 0, 0), obj('mid', 20, 0), obj('top', 40, 0)];

  it('hitObject returns visually topmost (last in scene order)', () => {
    // point 50,20 is inside mid (20..100) and top (40..120) → top wins
    expect(hitObject(scene, { x: 50, y: 20 })?.id).toBe('top');
    // point 30,20 only inside mid
    expect(hitObject(scene, { x: 30, y: 20 })?.id).toBe('mid');
  });

  it('hitObjects lists every container, topmost first', () => {
    // (50,20) sits in all three (bottom 0..80, mid 20..100, top 40..120)
    const hits = hitObjects(scene, { x: 50, y: 20 });
    expect(hits.map((o) => o.id)).toEqual(['top', 'mid', 'bottom']);
  });

  it('miss returns null / empty', () => {
    expect(hitObject(scene, { x: 500, y: 500 })).toBeNull();
    expect(hitObjects(scene, { x: 500, y: 500 })).toEqual([]);
  });
});

describe('rubber band (FR-C4 multi-select)', () => {
  const scene = [obj('a', 0, 0), obj('b', 100, 100), obj('c', 200, 0)];

  it('band selects all intersecting objects', () => {
    const band = { x: 90, y: 90, w: 200, h: 20 };
    expect(objectsInBand(scene, band).map((o) => o.id)).toEqual(['b']);
  });

  it('zero-size band still catches objects it sits inside', () => {
    const band = { x: 10, y: 10, w: 0, h: 0 };
    expect(objectsInBand(scene, band).map((o) => o.id)).toEqual(['a']);
  });

  it('empty band area selects nothing', () => {
    expect(objectsInBand(scene, { x: 500, y: 500, w: 10, h: 10 })).toEqual([]);
  });
});

describe('link hits (FR-C7)', () => {
  const links = [
    link('h', [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
    link('v', [{ x: 50, y: -50 }, { x: 50, y: 50 }]),
  ];

  it('hit within slop of segment', () => {
    expect(hitLink(links, { x: 40, y: 5 })?.id).toBe('h');
    // (53,10): 10 px from h (> slop 6), 3 px from v → v
    expect(hitLink(links, { x: 53, y: 10 })?.id).toBe('v');
  });

  it('hit-tests the rendered curve instead of its control polygon', () => {
    const curved: SceneLink = {
      id: 'curve',
      route: 'curved',
      points: [{ x: 0, y: 0 }, { x: 100, y: 40 }],
    };
    expect(hitLink([curved], { x: 19, y: 2 }, 2)?.id).toBe('curve');
    expect(hitLink([curved], { x: 30, y: 30 })).toBeNull();
  });

  it('outside slop → null', () => {
    expect(hitLink(links, { x: 40, y: LINK_HIT_SLOP_PX + 1 })).toBeNull();
  });

  it('nearest wins when both within slop', () => {
    // crossing point (50,0): both at 0 → first in reverse order wins deterministically
    const nearest = hitLink(links, { x: 50, y: 0 });
    expect(nearest).not.toBeNull();
    expect(['h', 'v']).toContain(nearest?.id);
  });

  it('custom slop respected (nearest within larger radius)', () => {
    // (40,20): h at 20, v at 10 → v is nearest
    expect(hitLink(links, { x: 40, y: 20 }, 25)?.id).toBe('v');
  });
});

describe('combined pick', () => {
  it('object beats link when both under cursor', () => {
    const objects = [obj('a', 40, -20, 20, 40)];
    const links = [link('l', [{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    expect(pick(objects, links, { x: 50, y: 0 })).toEqual({ type: 'object', id: 'a' });
  });

  it('link picked when no object covers point', () => {
    const links = [link('l', [{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    expect(pick([], links, { x: 50, y: 2 })).toEqual({ type: 'link', id: 'l' });
  });

  it('empty canvas pick → null', () => {
    expect(pick([], [], { x: 1, y: 1 })).toBeNull();
  });
});
