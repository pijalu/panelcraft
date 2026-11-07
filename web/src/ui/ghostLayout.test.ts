// SPDX-License-Identifier: GPL-3.0-only
// F-20 ghost placement: below the document's own objects, deterministic grid.

import { describe, expect, it } from 'vitest';
import { layoutGhosts } from './ghostLayout';
import type { GhostObject } from '../engine/model/imports';

const ghost = (ref: string, kind: 'person' | 'system' = 'system'): GhostObject => ({
  ref,
  alias: 'shared',
  path: 'shared/actors.pcd',
  obj: { kind, id: ref.split('.')[1]!, pos: { line: 1, col: 1 } },
});

const state = {
  objects: [
    { id: 'a', kind: 'system' as const, x: 40, y: 40, w: 160, h: 60 },
    { id: 'b', kind: 'system' as const, x: 240, y: 40, w: 160, h: 60 },
  ],
  links: [],
};

describe('layoutGhosts (F-20)', () => {
  it('returns nothing for an empty import list', () => {
    expect(layoutGhosts([], state)).toEqual([]);
  });

  it('places ghosts below the document objects', () => {
    const out = layoutGhosts([ghost('shared.psp', 'person')], state);
    expect(out[0]?.id).toBe('shared.psp');
    expect(out[0]!.y).toBeGreaterThan(40 + 60);
  });

  it('is deterministic and grid-aligned', () => {
    const list = Array.from({ length: 7 }, (_, i) => ghost(`shared.o${i}`));
    const first = layoutGhosts(list, state);
    const second = layoutGhosts(list, state);
    expect(first).toEqual(second);
    // five per row, then wrap
    expect(first[0]!.x).toBe(40);
    expect(first[5]!.x).toBe(40);
    expect(first[5]!.y).toBeGreaterThan(first[0]!.y);
  });
});
