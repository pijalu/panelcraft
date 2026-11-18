// SPDX-License-Identifier: GPL-3.0-only
// C4 decomposition + embedded source rules (IR v10; FILE-FORMAT §3.2, §3.3).
// The hierarchy is authored on the parent only, so these tests cover the whole
// edge: path resolution, allowed level transitions, one-parent-per-child,
// cycles, missing targets and the source limits.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../format/parser';
import { printDoc } from '../format/printer';
import type { Diagnostic } from '../format/diagnostics';
import type { Doc } from './types';
import { validateDoc, type ImportSource } from './validate';
import {
  ALLOWED_CHILD_LEVELS, SOURCE_MAX_DOC_BYTES, SOURCE_MAX_OBJECT_LINES,
  drillchain, parentOf, resolveDrilldown,
} from './hierarchy';

const parse = (src: string): Doc => {
  const res = parsePDL(`pcd 1.0\n${src}\n`);
  if (res.doc === null) throw new Error(`parse failed: ${JSON.stringify(res.diagnostics)}`);
  return res.doc;
};

/** In-memory workspace: path → file text, served as the ImportSource probe. */
const workspace = (files: Record<string, string>): ImportSource => ({
  classify: (from, path) => {
    void from;
    return files[path] === undefined ? { kind: 'missing' } : { kind: 'ok', resolved: path };
  },
  importsOf: () => [],
  read: (path) => files[path] ?? null,
});

const codes = (diags: Diagnostic[]): string[] => diags.map((d) => d.code);

describe('resolveDrilldown', () => {
  it('resolves a sibling path from the declaring file', () => {
    expect(resolveDrilldown('systems/shop.pcd', '../containers/shop.pcd'))
      .toEqual({ ok: true, path: 'containers/shop.pcd' });
  });

  it('resolves a nested path relative to the file', () => {
    expect(resolveDrilldown('systems/shop.pcd', 'children/api.pcd'))
      .toEqual({ ok: true, path: 'systems/children/api.pcd' });
  });

  it('rejects escapes, absolute paths and backslashes (P213)', () => {
    expect(resolveDrilldown('a.pcd', '../outside.pcd')).toEqual({ ok: false, problem: 'escape' });
    expect(resolveDrilldown('a.pcd', '/etc/x.pcd')).toEqual({ ok: false, problem: 'escape' });
    expect(resolveDrilldown('a.pcd', 'dir\\x.pcd')).toEqual({ ok: false, problem: 'escape' });
  });

  it('rejects a non-.pcd target (P213)', () => {
    expect(resolveDrilldown('a.pcd', 'notes.md')).toEqual({ ok: false, problem: 'not-pcd' });
  });
});

describe('drilldown round-trip', () => {
  it('rejects a legacy view id on a drilldown with E118', () => {
    const res = parsePDL('pcd 1.0\nsystem shop "Shop" {\n  drilldown "containers.pcd" view containers\n}\n');
    expect(res.doc).toBeNull();
    expect(res.diagnostics[0]?.code).toBe('E118');
  });

  it('prints drilldown then source, path quoted', () => {
    const doc = parse(`system shop "Shop" {
  source {
    text "x"
    language "go"
  }
  drilldown "containers/shop.pcd"
}`);
    expect(printDoc(doc)).toBe(`pcd 1.0

system shop "Shop" {
  drilldown "containers/shop.pcd"
  source {
    language "go"
    text "x"
  }
}
`);
  });

  it('keeps blank and quoted source lines verbatim', () => {
    const doc = parse(`component c "C" {
  source {
    text ""
    text "say \\"hi\\""
    text "  and a literal tab:\tend"
  }
}`);
    expect(doc.objects[0]?.source).toEqual({
      lines: ['', 'say "hi"', '  and a literal tab:\tend'],
    });
    const again = parsePDL(printDoc(doc)).doc;
    expect(again?.objects[0]?.source).toEqual(doc.objects[0]?.source);
  });
});

describe('hierarchy validation', () => {
  const root = `system shop "Shop" {
  drilldown "containers/shop.pcd"
}`;
  const child = `pcd 1.0
level container
container api "API"
`;

  it('accepts a matching level', () => {
    const doc = parse(root);
    const diags = validateDoc(doc, { file: 'shop.pcd', imports: workspace({ 'containers/shop.pcd': child }) });
    expect(codes(diags).filter((c) => c.startsWith('P21'))).toEqual([]);
  });

  it('reports a missing target as a warning (P212)', () => {
    const doc = parse(root);
    const diags = validateDoc(doc, { file: 'shop.pcd', imports: workspace({}) });
    expect(codes(diags)).toContain('P212');
  });

  it('reports an incompatible C4 level (P214)', () => {
    const doc = parse(root);
    const wrong = child.replace('level container', 'level context');
    const diags = validateDoc(doc, { file: 'shop.pcd', imports: workspace({ 'containers/shop.pcd': wrong }) });
    expect(codes(diags)).toContain('P214');
  });

  it('accepts a child that declares no level at all', () => {
    const doc = parse(root);
    const noLevel = child.replace('level container\n', '');
    const diags = validateDoc(doc, { file: 'shop.pcd', imports: workspace({ 'containers/shop.pcd': noLevel }) });
    expect(codes(diags).filter((c) => c.startsWith('P21'))).toEqual([]);
  });

  it('rejects a child with a legacy view block instead of matching by id', () => {
    const legacy = child.replace('container api "API"', 'view "Containers" as containers {\n  layout auto LR\n}');
    const res = parsePDL(legacy);
    expect(res.doc).toBeNull();
    expect(res.diagnostics[0]?.code).toBe('E117');
  });

  it('reports a kind that cannot decompose (P215)', () => {
    const diags = validateDoc(parse('person u "User" {\n  drilldown "u.pcd"\n}'));
    expect(codes(diags)).toContain('P215');
  });

  it('reports an escaping or non-pcd target (P213)', () => {
    expect(codes(validateDoc(parse('system s "S" {\n  drilldown "../out.pcd"\n}')))).toContain('P213');
    expect(codes(validateDoc(parse('system s "S" {\n  drilldown "notes.md"\n}')))).toContain('P213');
  });

  it('reports two objects claiming the same child (P211)', () => {
    const diags = validateDoc(parse(`system a "A" {
  drilldown "child.pcd"
}
system b "B" {
  drilldown "child.pcd"
}`));
    expect(codes(diags)).toContain('P211');
  });

  it('reports a decomposition cycle (P216)', () => {
    const files = {
      'a.pcd': 'pcd 1.0\nsystem s "S" {\n  drilldown "b.pcd"\n}\n',
      'b.pcd': 'pcd 1.0\nsystem t "T" {\n  drilldown "a.pcd"\n}\n',
    };
    const doc = parsePDL(files['a.pcd']).doc as Doc;
    const diags = validateDoc(doc, { file: 'a.pcd', imports: workspace(files) });
    expect(codes(diags)).toContain('P216');
    expect(drillchain('a.pcd', (p) => files[p as keyof typeof files] ?? null).cyclic).toBe(true);
  });

  it('names only system, system_ext and container as decomposable', () => {
    expect(Object.keys(ALLOWED_CHILD_LEVELS).sort()).toEqual(['container', 'system', 'system_ext']);
  });
});

describe('source limits (P217)', () => {
  it('reports a single object over the line limit', () => {
    const lines = Array.from({ length: SOURCE_MAX_OBJECT_LINES + 1 }, () => 'text "x"').join('\n    ');
    const doc = parse(`container c "C" {\n  source {\n    ${lines}\n  }\n}`);
    expect(codes(validateDoc(doc))).toContain('P217');
  });

  it('reports a document over the byte limit', () => {
    const big = 'x'.repeat(60000);
    const chunk = `container c%d "C%d" {\n  source {\n    text "${big}"\n  }\n}`;
    const src = [0, 1, 2, 3, 4].map((i) => chunk.replaceAll('%d', String(i))).join('\n');
    const doc = parse(src);
    const hit = validateDoc(doc).filter((d) => d.code === 'P217' && d.message.includes('per document'));
    expect(hit).toHaveLength(1);
    expect(SOURCE_MAX_DOC_BYTES).toBe(262144);
  });
});

describe('parent lookup', () => {
  it('finds the owning object and file for a child', () => {
    const files = [
      { path: 'context/shop.pcd', doc: parse('system shop "Shop" {\n  drilldown "../containers/shop.pcd"\n}') },
      { path: 'containers/shop.pcd', doc: parse('container api "API"') },
    ];
    expect(parentOf(files, 'containers/shop.pcd')?.obj.id).toBe('shop');
    expect(parentOf(files, 'nowhere.pcd')).toBeUndefined();
  });
});
