// SPDX-License-Identifier: GPL-3.0-only
// F-19 command layer: clipboard id remapping, alignment, distribution and
// equal-size — pure functions over the canvas model.

import { describe, expect, it } from 'vitest';
import type { DiagramLink, DiagramObject, DiagramState } from './CanvasController';
import {
  alignObjects, boundsOf, copySelection, distributeObjects, equalSizeObjects, pasteClipboard,
} from './canvasCommands';

const obj = (id: string, x: number, y: number, w = 100, h = 60): DiagramObject => ({
  id, kind: 'system', x, y, w, h, name: id,
});
const link = (id: string, from: string, to: string): DiagramLink => ({ id, from, to });

const state = (): DiagramState => ({
  objects: [obj('a', 0, 0), obj('b', 200, 0), obj('c', 400, 100)],
  links: [link('ab', 'a', 'b'), link('bc', 'b', 'c')],
});

describe('copySelection', () => {
  it('copies the selected objects and only the links fully inside the selection', () => {
    const clip = copySelection(state(), new Set(['a', 'b']), new Set());
    expect(clip.objects.map((o) => o.id)).toEqual(['a', 'b']);
    expect(clip.links.map((l) => l.id)).toEqual(['ab']); // bc leaves the selection
  });

  it('copies an explicitly selected link even when its ends are not selected', () => {
    const clip = copySelection(state(), new Set(['a']), new Set(['ab']));
    expect(clip.links.map((l) => l.id)).toEqual(['ab']);
  });
});

describe('pasteClipboard', () => {
  it('gives every pasted object a fresh id and remaps its links', () => {
    const base = state();
    const clip = copySelection(base, new Set(['a', 'b']), new Set());
    const res = pasteClipboard(base, clip);
    const ids = res.objects;
    expect(ids).toHaveLength(2);
    // no id collides with the existing entities
    const existing = new Set(base.objects.map((o) => o.id));
    for (const id of ids) expect(existing.has(id)).toBe(false);
    // the pasted link points at the pasted copy, not the original
    const pastedLink = res.state.links.at(-1)!;
    expect(res.links).toContain(pastedLink.id);
    expect(ids).toContain(pastedLink.from);
    expect(ids).toContain(pastedLink.to);
  });

  it('offsets the pasted geometry', () => {
    const base = state();
    const clip = copySelection(base, new Set(['a']), new Set());
    const res = pasteClipboard(base, clip, { x: 10, y: 20 });
    const pasted = res.state.objects.at(-1)!;
    expect([pasted.x, pasted.y]).toEqual([10, 20]);
  });

  it('drops links whose endpoints are not in the clipboard', () => {
    const base = state();
    const clip = { objects: [obj('x', 0, 0)], links: [link('bad', 'x', 'missing')] };
    const res = pasteClipboard(base, clip);
    expect(res.links).toEqual([]);
  });
});

describe('alignObjects', () => {
  const objs = [obj('a', 0, 0, 100, 60), obj('b', 200, 50, 40, 20), obj('c', 400, 100, 80, 80)];

  it('aligns left/right/centre against the selection box', () => {
    expect(alignObjects(objs, 'left').map((o) => o.x)).toEqual([0, 0, 0]);
    expect(alignObjects(objs, 'right').map((o) => o.x + o.w)).toEqual([480, 480, 480]);
    expect(alignObjects(objs, 'centerX').map((o) => o.x + o.w / 2)).toEqual([240, 240, 240]);
  });

  it('aligns top/bottom/middle against the selection box', () => {
    expect(alignObjects(objs, 'top').map((o) => o.y)).toEqual([0, 0, 0]);
    expect(alignObjects(objs, 'bottom').map((o) => o.y + o.h)).toEqual([180, 180, 180]);
    expect(alignObjects(objs, 'centerY').map((o) => o.y + o.h / 2)).toEqual([90, 90, 90]);
  });

  it('is a no-op for a single object', () => {
    const one = [obj('a', 10, 10)];
    expect(alignObjects(one, 'left')).toBe(one);
  });

  it('computed bounds cover every object', () => {
    expect(boundsOf(objs)).toEqual({ x: 0, y: 0, w: 480, h: 180 });
    expect(boundsOf([])).toBeNull();
  });
});

describe('distributeObjects', () => {
  it('spaces the middles evenly and keeps the extremes', () => {
    const objs = [obj('a', 0, 0, 100, 60), obj('b', 120, 0, 100, 60), obj('c', 500, 0, 100, 60)];
    const out = distributeObjects(objs, 'x');
    const centres = out.map((o) => o.x + o.w / 2).sort((x, y) => x - y);
    expect(centres).toEqual([50, 300, 550]);
  });

  it('is a no-op below three objects', () => {
    const two = [obj('a', 0, 0), obj('b', 100, 0)];
    expect(distributeObjects(two, 'x')).toBe(two);
  });
});

describe('equalSizeObjects', () => {
  it('gives every object the largest size and records it as explicit', () => {
    const objs = [obj('a', 0, 0, 100, 60), obj('b', 0, 0, 160, 40)];
    const out = equalSizeObjects(objs);
    expect(out.map((o) => [o.w, o.h])).toEqual([[160, 60], [160, 60]]);
    expect(out[0]?.size).toEqual({ w: 160, h: 60 });
  });

  it('is a no-op for a single object', () => {
    const one = [obj('a', 0, 0)];
    expect(equalSizeObjects(one)).toBe(one);
  });
});
