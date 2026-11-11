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
