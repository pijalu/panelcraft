// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP06: the unconditional resize size hints. These tests are the RED half
// of the work package — before the module existed nothing described the active
// object's current size during a resize that matched no other object.
import { describe, expect, it } from 'vitest';
import { hintAnchor, sizeHints, sizeText } from './sizeHints';

const target = { id: 'target', rect: { x: 100, y: 100, w: 140, h: 60 } };

describe('sizeText (UX08-WP06)', () => {
  it('formats the rounded W × H pair shared with the properties panel', () => {
    expect(sizeText({ w: 140, h: 60 })).toBe('140 × 60');
    expect(sizeText({ w: 139.6, h: 59.4 })).toBe('140 × 59');
  });
});

describe('sizeHints (UX08-WP06)', () => {
  it('always describes the active object, even when nothing matches', () => {
    const hints = sizeHints(target, []);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ id: 'target', active: true, label: '140 × 60' });
  });

  it('badges every other selected object with its unchanged model size', () => {
    const hints = sizeHints(target, [
      { id: 'peer', rect: { x: 400, y: 300, w: 200, h: 100 } },
      { id: 'other', rect: { x: 700, y: 300, w: 48, h: 32 } },
    ]);
    expect(hints.map((h) => h.id)).toEqual(['target', 'peer', 'other']);
    expect(hints.filter((h) => !h.active).map((h) => h.label)).toEqual(['200 × 100', '48 × 32']);
  });

  it('never duplicates a hint for the same object', () => {
    const hints = sizeHints(target, [target, { id: 'peer', rect: { x: 0, y: 0, w: 96, h: 48 } }]);
    expect(hints.map((h) => h.id)).toEqual(['target', 'peer']);
  });
});

describe('hintAnchor (UX08-WP06)', () => {
  const rect = { x: 100, y: 100, w: 140, h: 60 };

  it('sits outside the dragged edge or corner', () => {
    expect(hintAnchor(rect, 'e')).toEqual({ x: 252, y: 130 });
    expect(hintAnchor(rect, 'w')).toEqual({ x: 88, y: 130 });
    expect(hintAnchor(rect, 'n')).toEqual({ x: 170, y: 88 });
    expect(hintAnchor(rect, 's')).toEqual({ x: 170, y: 172 });
    expect(hintAnchor(rect, 'se')).toEqual({ x: 252, y: 172 });
    expect(hintAnchor(rect, 'nw')).toEqual({ x: 88, y: 88 });
  });

  it('accepts a larger gap so a badge can clear a handle', () => {
    expect(hintAnchor(rect, 'e', 24)).toEqual({ x: 264, y: 130 });
  });
});
