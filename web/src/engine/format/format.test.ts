// SPDX-License-Identifier: GPL-3.0-only
// PDL parser tests (M1-WP2) — table-driven incl. FILE-FORMAT §14 sample and
// syntax error triggers. Semantic P-code tests live in engine/model.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { lex } from './lexer';
import { CHECKOUT_SRC } from './format.testdata';

describe('lexer', () => {
  it('lexes arrows with direction + type', () => {
    const { tokens, diagnostics } = lex('a -> b\na <- b\na <-> b\na -requests-> b\n');
    expect(diagnostics).toEqual([]);
    const arrows = tokens.filter((t) => t.type === 'arrow');
    expect(arrows.map((a) => a.text)).toEqual(['->', '<-', '<->', '-requests->']);
    expect(arrows.map((a) => a.arrow?.tail)).toEqual([false, true, true, false]);
    expect(arrows.map((a) => a.arrow?.head)).toEqual([true, false, true, true]);
    expect(arrows[3]!.arrow?.type).toBe('requests');
  });

  it('keeps #rgb/#rrggbb as color, other # as comment', () => {
    const { tokens } = lex('# a comment\nfill #2d6cdf\nfill #fff\n');
    expect(tokens.filter((t) => t.type === 'color').map((t) => t.text)).toEqual(['#2d6cdf', '#fff']);
    expect(tokens.filter((t) => t.type === 'comment').map((t) => t.text)).toEqual(['a comment']);
  });

  it('collects lexer errors with positions', () => {
    const r = lex('s "a\\tb"\nt "unterminated');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['E106', 'E101']);
    expect(r.diagnostics.map((d) => d.line)).toEqual([1, 2]);
  });
});

describe('parser — happy paths', () => {
  it('parses the FILE-FORMAT §14 checkout sample into the expected IR shape', () => {
    const { doc, diagnostics } = parsePDL(CHECKOUT_SRC);
    expect(diagnostics).toEqual([]);
    expect(doc!.title).toBe('Checkout');
    expect(doc!.imports[0]).toMatchObject({ alias: 'common', path: '../common/actors.pcd' });
    // trailing same-line comments attach to the following statement (D-M1-10)
    expect(doc!.objects[0]!.comments).toEqual(['provides common.psp']);
    expect(doc!.objects[6]!.comments).toEqual(['imported in real files; inlined here']);
    expect(doc!.objects.map((o) => o.id)).toEqual(['user', 'shop', 'api', 'db', 'events', 'psp', 'ctx']);
    expect(doc!.objects[1]).toMatchObject({ kind: 'system', name: 'Webshop', technology: 'React', tags: ['core'] });
    expect(doc!.objects[1]).toMatchObject({ properties: [{ key: 'owner', value: 'team-commerce' }] });
    expect(doc!.objects[6]).toMatchObject({ contains: ['api', 'db'] });
    expect(doc!.links.map((l) => [l.from, l.to, l.type ?? null, l.id ?? null])).toEqual([
      ['user', 'shop', null, null],
      ['shop', 'api', 'requests', 'L1'],
      ['api', 'db', 'writes', null],
      ['api', 'events', 'publishes', 'L3'],
      ['api', 'psp', 'requests', 'L4'],
    ]);
    const flow = doc!.flows[0]!;
    expect(flow.id).toBe('happy');
    expect(flow.steps.map((s) => s.type)).toEqual(['intro', 'msg', 'process', 'alt', 'par', 'info', 'conclusion']);
    const alt = flow.steps[3]!;
    expect(alt.type === 'alt' && alt.branches.map((b) => b.label)).toEqual(['card', 'invoice']);
    const par = flow.steps[4]!;
    expect(par.type === 'par' && par.lanes.map((l) => l.length)).toEqual([1, 1]);
    const view = doc!.views[0]!;
    expect(view.lines.map((l) => l.type)).toEqual(['layout', 'position', 'position']);
    expect(doc!.styles[0]).toEqual({
      target: 'api',
      style: { fill: '#2d6cdf' },
      pos: { line: 49, col: 1 },
    });
  });

  it('normalizes reversed arrows (a <- b ⇒ b -> a) and keeps bidir', () => {
    const { doc } = parsePDL('pcd 1.0\na <- b\nx <-> y\nb -serves-> a\n');
    expect(doc!.links.map((l) => [l.from, l.to, !!l.bidir])).toEqual([
      ['b', 'a', false],
      ['x', 'y', true],
      ['b', 'a', false],
    ]);
    expect(doc!.links[2]!.type).toBe('serves');
  });

  it('attaches comments to the following statement (§11)', () => {
    const { doc } = parsePDL('pcd 1.0\n# lead\nsystem a "A"\n# two\n# lines\nnote n "N" { attach a }');
    expect(doc!.objects[0]!.comments).toEqual(['lead']);
    expect(doc!.objects[1]!.comments).toEqual(['two', 'lines']);
  });

  it('attaches pre-magic comments to the doc', () => {
    const { doc } = parsePDL('# top\npcd 1.0\nsystem a "A"');
    expect(doc!.comments).toEqual(['top']);
  });

  it('parses goto forms incl. cross-file target', () => {
    const { doc } = parsePDL('pcd 1.0\nflow "f" as f1 {\n  goto refunds\n  goto "billing/refunds.pcd#cleanup" return here\n}\n');
    const steps = doc!.flows[0]!.steps;
    expect(steps[0]).toMatchObject({ type: 'goto', flow: 'refunds' });
    expect(steps[1]).toMatchObject({ type: 'goto', file: 'billing/refunds.pcd', flow: 'cleanup', ret: 'here' });
  });

  it('parses views (hide/hideTag/pin/saved layout) and waypoints/link styles', () => {
    const { doc } = parsePDL(
      'pcd 1.0\nview "V" {\n hide tag external\n hide dagre\n pin db\n layout saved\n}\n' +
      'a -> b as L9 {\n label "x"\n style { dashed stroke #333 }\n waypoint (120, 300)\n}\n',
    );
    expect(doc!.views[0]!.lines.map((l) => l.type)).toEqual(['hideTag', 'hide', 'pin', 'layout']);
    const l = doc!.links[0]!;
    expect(l.style).toEqual({ dashed: true, stroke: '#333' });
    expect(l.waypoints).toEqual([[120, 300]]);
  });

  it('keeps unknown attributes as raw data with positions (§12)', () => {
    const { doc } = parsePDL('pcd 1.0\nsystem a "A" {\n experimental "yes"\n}\n');
    expect(doc!.objects[0]!.attributes).toEqual([{ raw: 'experimental "yes"', pos: { line: 3, col: 2 } }]);
  });

  it('minimal file: magic only', () => {
    const { doc, diagnostics } = parsePDL('pcd 1.0');
    expect(diagnostics).toEqual([]);
    expect(doc!.objects).toEqual([]);
    expect(doc!.formatVersion).toBe('1.0');
  });
});

describe('parser — syntax error table (file aborts)', () => {
  const cases: Array<[name: string, src: string, code: string, line: number]> = [
    ['missing magic', 'system a "A"', 'E103', 1],
    ['unsupported major', 'pcd 2.0', 'E103', 1],
    ['numeric statement', 'pcd 1.0\n42', 'E105', 2],
    ['unclosed object block', 'pcd 1.0\nsystem a "A" {', 'E104', 2],
    ['unclosed flow block', 'pcd 1.0\nflow "f" as f {', 'E104', 2],
    ['stray token as statement', 'pcd 1.0\n"just a string"', 'E105', 2],
    ['bad arrow', 'pcd 1.0\na - b', 'E108', 2],
    ['link missing target', 'pcd 1.0\na ->', 'E100', 2],
    ['duplicate object attr', 'pcd 1.0\nsystem a "A" {\n technology "x"\n technology "y"\n}', 'E110', 4],
    ['bad color value', 'pcd 1.0\nstyle a { fill nothex }', 'E111', 2],
    ['invalid branch label', 'pcd 1.0\nflow "f" as f {\n alt "x" {\n  bare { info "y" }\n }\n}', 'E100', 4],
    ['goto without target', 'pcd 1.0\nflow "f" as f {\n goto\n}\n', 'E113', 4],
    ['goto string without #', 'pcd 1.0\nflow "f" as f {\n goto "refunds.pcd"\n}\n', 'E113', 3],
    ['deep nesting', `pcd 1.0\nflow "f" as f {\n ${'par { { '.repeat(33)}${'}}'.repeat(33)}\n}\n`, 'E112', 3],
    ['overlong identifier', `pcd 1.0\nsystem ${'a'.repeat(65)} "X"`, 'E102', 2],
  ];
  for (const [name, src, code, line] of cases) {
    it(`abort: ${name} → ${code} @${line}`, () => {
      const { doc, diagnostics } = parsePDL(src);
      expect(doc).toBeNull();
      expect(diagnostics.some((d) => d.code === code && d.line === line && d.severity === 'error')).toBe(true);
    });
  }

  it('duplicate meta keeps first + warning', () => {
    const { doc, diagnostics } = parsePDL('pcd 1.0\ndirection LR\ndirection TB');
    expect(doc!.direction).toBe('LR');
    expect(diagnostics[0]).toMatchObject({ code: 'W100', severity: 'warning' });
  });
});
