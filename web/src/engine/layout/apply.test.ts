// SPDX-License-Identifier: GPL-3.0-only
// writePositions tests (ADR 0007): explicit commit into the single
// top-level layout block. Never automatic; one call = one document change.
import { describe, expect, it } from 'vitest';
import type { Doc, Obj } from '../model/types';
import { writePositions } from './apply';

function doc(): Doc {
  const obj = (id: string): Obj => ({ kind: 'system', id, pos: { line: 1, col: 1 } });
  return {
    irVersion: 11,
    formatVersion: '1.0',
    icons: [], imports: [],
    objects: [obj('api'), obj('db'), obj('web')],
    links: [], flows: [], styles: [],
  };
}

const POS = { db: { x: 200, y: 40 }, api: { x: 10, y: 20 } };

describe('writePositions', () => {
  it('writes sorted positions and creates the top-level layout block', () => {
    const d = doc();
    const { doc: out, written } = writePositions(d, POS);
    expect(written).toEqual(['api', 'db']);
    expect(out.layout?.positions).toEqual([
      { id: 'api', x: 10, y: 20 },
      { id: 'db', x: 200, y: 40 },
    ]);
    expect(out).not.toBe(d);
    expect(d.layout).toBeUndefined();
  });

  it('replaces same-id positions and preserves directive/pins/hides', () => {
    const d = doc();
    d.layout = {
      directive: { mode: 'auto', dir: 'BT' },
      positions: [{ id: 'api', x: 1, y: 1 }, { id: 'web', x: 30, y: 30 }],
      pins: ['db'], hidden: ['web'], hiddenTags: ['x'],
      pos: { line: 1, col: 1 },
    };
    const { doc: out } = writePositions(d, POS);
    expect(out.layout?.directive).toEqual({ mode: 'auto', dir: 'BT' });
    expect(out.layout?.pins).toEqual(['db']);
    expect(out.layout?.hidden).toEqual(['web']);
    expect(out.layout?.hiddenTags).toEqual(['x']);
    expect(out.layout?.positions).toEqual([
      { id: 'web', x: 30, y: 30 },
      { id: 'api', x: 10, y: 20 },
      { id: 'db', x: 200, y: 40 },
    ]);
  });

  it('filters unknown ids; empty positions is a no-op that keeps the doc', () => {
    const d = doc();
    expect(writePositions(d, {}).written).toEqual([]);
    expect(writePositions(d, {}).doc.layout).toBeUndefined();
    expect(writePositions(d, { ghost: { x: 1, y: 2 } }).written).toEqual([]);
  });

  it('repeated commits reuse the one layout block', () => {
    const first = writePositions(doc(), POS);
    const second = writePositions(first.doc, { api: { x: 1, y: 1 } });
    expect(second.doc.layout?.positions).toEqual([
      { id: 'db', x: 200, y: 40 },
      { id: 'api', x: 1, y: 1 },
    ]);
  });
});
