// SPDX-License-Identifier: GPL-3.0-only
// Regression tests for the removal of named views (bugs.md, ADR 0007).
// Legacy view syntax must be rejected with an actionable diagnostic; the
// retained layout state must live at the top level of the document.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';

interface LayoutShape {
  directive?: { mode: 'auto'; dir: string } | { mode: 'saved' };
  positions: { id: string; x: number; y: number }[];
  pins: string[];
  hidden: string[];
  hiddenTags: string[];
}

const layoutOf = (src: string): LayoutShape | undefined =>
  (parsePDL(src).doc as unknown as { layout?: LayoutShape } | null)?.layout;

describe('legacy named views are rejected (ADR 0007)', () => {
  it('rejects a named view block with E117 and a conversion hint', () => {
    const r = parsePDL('pcd 1.0\nview "Main" as main {\n  layout auto LR\n  pin a\n}\n');
    expect(r.doc).toBeNull();
    const d = r.diagnostics[0];
    expect(d?.code).toBe('E117');
    expect(d?.message.toLowerCase()).toMatch(/view|top.level|layout/);
  });

  it('rejects a view id on a drilldown with E118', () => {
    const r = parsePDL('pcd 1.0\nsystem s "S" {\n  drilldown "child.pcd" view detail\n}\n');
    expect(r.doc).toBeNull();
    expect(r.diagnostics[0]?.code).toBe('E118');
  });
});

describe('top-level layout state (ADR 0007)', () => {
  const SRC = `pcd 1.0
person a "A"
person b "B"
layout auto TB
position a (10, 20)
position b (30.5, 40)
pin a
hide b
hide tag backend
`;

  it('parses layout directives/positions/pins/hides into one top-level state', () => {
    const l = layoutOf(SRC);
    expect(l).toBeDefined();
    expect(l?.directive).toEqual({ mode: 'auto', dir: 'TB' });
    expect(l?.positions).toEqual([
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 30.5, y: 40 },
    ]);
    expect(l?.pins).toEqual(['a']);
    expect(l?.hidden).toEqual(['b']);
    expect(l?.hiddenTags).toEqual(['backend']);
  });

  it('prints top-level layout statements and round-trips idempotently', () => {
    const r = parsePDL(SRC);
    expect(r.doc).not.toBeNull();
    const printed = printDoc(r.doc!);
    expect(printed).toContain('layout auto TB');
    expect(printed).toContain('position a (10, 20)');
    expect(printed).toContain('pin a');
    expect(printed).toContain('hide tag backend');
    expect(printDoc(parsePDL(printed).doc!)).toBe(printed);
  });
});
