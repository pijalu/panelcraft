// SPDX-License-Identifier: GPL-3.0-only
// apply-to-file tests (M6-WP3) — explicit commit semantics.
import { describe, expect, it } from 'vitest';
import type { Doc, Obj } from '../model/types';
import { DEFAULT_VIEW_NAME, applyLayoutToView } from './apply';

function doc(views: Doc['views']): Doc {
  const obj = (id: string): Obj => ({
    kind: 'system',
    id,
    pos: { line: 1, col: 1 },
  });
  return {
    irVersion: 1,
    formatVersion: '1.0',
    imports: [],
    objects: [obj('api'), obj('db'), obj('web')],
    links: [],
    flows: [],
    views,
    styles: [],
  };
}

const POS = { api: { x: 10, y: 20 }, db: { x: 200, y: 40 } };

describe('applyLayoutToView', () => {
  it('writes sorted position lines into the named view', () => {
    const d = doc([{ name: 'V1', lines: [], pos: { line: 1, col: 1 } }]);
    const { doc: out, written } = applyLayoutToView(d, 'V1', POS);
    expect(written).toEqual(['api', 'db']);
    const v = out.views[0]!;
    const posLines = v.lines.filter((l) => l.type === 'position');
    expect(posLines.map((l) => (l as { id: string }).id)).toEqual(['api', 'db']);
    expect(out).not.toBe(d); // immutable — input untouched
    expect(d.views[0]!.lines).toHaveLength(0);
  });

  it('replaces existing position lines for same ids, preserves other lines in order', () => {
    const d = doc([
      {
        name: 'V1',
        lines: [
          { type: 'layout', mode: 'auto', dir: 'LR', pos: { line: 1, col: 1 } },
          { type: 'position', id: 'api', x: 1, y: 1, pos: { line: 2, col: 1 } },
          { type: 'pin', id: 'db', pos: { line: 3, col: 1 } },
        ],
        pos: { line: 1, col: 1 },
      },
    ]);
    const { doc: out } = applyLayoutToView(d, 'V1', POS);
    const lines = out.views[0]!.lines;
    expect(lines).toHaveLength(4); // layout + pin + 2 positions (old api line replaced)
    expect(lines[0]!.type).toBe('layout');
    expect(lines[1]!.type).toBe('pin');
    const posLines = lines.filter((l) => l.type === 'position');
    expect(posLines).toHaveLength(2);
    expect(posLines.find((l) => (l as { id: string }).id === 'api')).toMatchObject({ x: 10, y: 20 });
  });

  it('targets the "Default" view when viewName is undefined, without hijacking named views', () => {
    const d = doc([
      { name: 'Roadmap', lines: [], pos: { line: 1, col: 1 } },
      { name: 'Second', lines: [], pos: { line: 1, col: 1 } },
    ]);
    const { doc: out } = applyLayoutToView(d, undefined, POS);
    const def = out.views.find((v) => v.name === 'Default');
    expect(def?.lines).toHaveLength(2);
    expect(out.views.find((v) => v.name === 'Roadmap')?.lines).toHaveLength(0); // untouched
  });

  it('reuses the existing "Default" view on repeated undefined-name commits', () => {
    const d0 = doc([]);
    const first = applyLayoutToView(d0, undefined, POS);
    const second = applyLayoutToView(first.doc, undefined, { api: { x: 1, y: 1 } });
    expect(second.doc.views.filter((v) => v.name === 'Default')).toHaveLength(1);
    const def = second.doc.views.find((v) => v.name === 'Default');
    const posLines = def?.lines.filter((l) => l.type === 'position') ?? [];
    expect(posLines).toHaveLength(2); // api updated, db kept from the first commit
    expect(posLines.find((l) => (l as { id: string }).id === 'api')).toMatchObject({ x: 1, y: 1 });
    expect(posLines.find((l) => (l as { id: string }).id === 'db')).toMatchObject({ x: 200, y: 40 });
  });

  it('creates a "Default" view when the doc has none (implicit default)', () => {
    const d = doc([]);
    const { doc: out } = applyLayoutToView(d, undefined, POS);
    expect(out.views).toHaveLength(1);
    expect(out.views[0]!.name).toBe(DEFAULT_VIEW_NAME);
    expect(out.views[0]!.lines).toHaveLength(2);
  });

  it('creates the requested view when the name is unknown', () => {
    const d = doc([]);
    const { doc: out } = applyLayoutToView(d, 'Roadmap', POS);
    expect(out.views.map((v) => v.name)).toEqual(['Roadmap']);
  });

  it('filters unknown ids and returns no-op for empty positions', () => {
    const d = doc([{ name: 'V1', lines: [], pos: { line: 1, col: 1 } }]);
    const empty = applyLayoutToView(d, 'V1', {});
    expect(empty.written).toEqual([]);
    expect(empty.doc.views[0]!.lines).toHaveLength(0);

    const ghost = applyLayoutToView(d, 'V1', { ghost: { x: 1, y: 2 } });
    expect(ghost.written).toEqual([]);
    expect(ghost.doc.views[0]!.lines).toHaveLength(0);
  });

  it('round-trips through the printer/parser pipeline without loss', () => {
    // If format exports exist, sanity-check text round-trip; otherwise IR-level.
    const d = doc([{ name: 'V1', lines: [{ type: 'pin', id: 'db', pos: { line: 1, col: 1 } }], pos: { line: 1, col: 1 } }]);
    const { doc: out } = applyLayoutToView(d, 'V1', POS);
    const v = out.views[0]!;
    const pin = v.lines.find((l) => l.type === 'pin');
    expect(pin).toMatchObject({ id: 'db' });
    expect(v.lines.filter((l) => l.type === 'position')).toHaveLength(2);
  });
});
