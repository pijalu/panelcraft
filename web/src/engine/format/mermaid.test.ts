// SPDX-License-Identifier: GPL-3.0-only
// Mermaid import converter tests (M1-WP5+6): flowchart shape→kind table,
// edges (labels/chained/&), subgraphs, C4 families, and the invariant that
// converter output is valid PDL (print → parse → clean).
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { fromMermaid } from './mermaid';
import { fromC4 } from './mermaidC4';
import type { Doc } from '../model/types';

const kinds = (doc: Doc): Record<string, string> =>
  Object.fromEntries(doc.objects.map((o) => [o.id, o.kind]));

const codesOf = (ds: { code: string }[]): string[] => ds.map((d) => d.code);

describe('flowchart — shape→kind table (§8)', () => {
  it('maps every documented shape', () => {
    const { doc } = fromMermaid([
      'flowchart TD',
      'r(rounded)',
      's[rect]',
      'st([stadium])',
      'cy[(cyl)]',
      'ci((circle))',
      'asym>asym]',
      'rh{rhombus}',
    ].join('\n'));
    expect(kinds(doc)).toEqual({
      r: 'component', s: 'container', st: 'system_ext', cy: 'datastore',
      ci: 'person', asym: 'queue', rh: 'note',
    });
  });
  it('implicit nodes default to container, first-mention order', () => {
    const { doc } = fromMermaid('flowchart LR\nb --> a\n');
    expect(doc.objects.map((o) => o.id)).toEqual(['b', 'a']);
    expect(doc.objects.every((o) => o.kind === 'container')).toBe(true);
  });
  it('TD header maps to TB direction; graph LR passes through', () => {
    expect(fromMermaid('flowchart TD\na-->b\n').doc.direction).toBe('TB');
    expect(fromMermaid('graph LR\na-->b\n').doc.direction).toBe('LR');
  });
  it('cleans node text: quotes stripped, <br/> becomes space', () => {
    const { doc } = fromMermaid('flowchart TD\na["My<br/>Label"]\nb("quoted")\n');
    expect(doc.objects[0]?.name).toBe('My Label');
    expect(doc.objects[1]?.name).toBe('quoted');
  });
});

describe('flowchart — edges', () => {
  it('plain, dotted, thick, undirected arrows set link type', () => {
    const src = ['flowchart LR', 'a --> b', 'c -.-> d', 'e ==> f', 'g --- h'].join('\n');
    const { doc } = fromMermaid(src);
    expect(doc.links.map((l) => `${l.from}>${l.to}:${l.type ?? '-'} `).join(''))
      .toBe('a>b:- c>d:dotted e>f:thick g>h:- ');
  });
  it('pipe labels and inline --label--> both become link labels', () => {
    const { doc } = fromMermaid('flowchart LR\na -->|pipe| b\nc -- inline --> d\n');
    expect(doc.links[0]?.label).toBe('pipe');
    expect(doc.links[1]?.label).toBe('inline');
  });
  it('chained edges expand to pairs', () => {
    const { doc } = fromMermaid('flowchart LR\na --> b --> c\n');
    expect(doc.links.map((l) => `${l.from}>${l.to}`)).toEqual(['a>b', 'b>c']);
  });
  it('& endpoints expand to the cross product', () => {
    const { doc } = fromMermaid('flowchart LR\na & b --> c\nd --> e & f\n');
    expect(doc.links.map((l) => `${l.from}>${l.to}`)).toEqual(['a>c', 'b>c', 'd>e', 'd>f']);
  });
  it('malformed edge warns and still returns a doc', () => {
    const r = fromMermaid('flowchart LR\na -->\nb[ok]\n');
    expect(r.doc.objects.map((o) => o.id)).toContain('b');
    expect(r.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(codesOf(r.diagnostics)).toContain('M200');
  });
});

describe('flowchart — subgraphs', () => {
  it('subgraph becomes a group with contains', () => {
    const { doc, diagnostics } = fromMermaid([
      'flowchart LR',
      'subgraph core [Core services]',
      '  a(component)',
      '  b --> a',
      'end',
      'c --> a',
    ].join('\n'));
    expect(diagnostics).toEqual([]);
    const g = doc.objects.find((o) => o.id === 'core');
    expect(g?.kind).toBe('group');
    expect(g?.name).toBe('Core services');
    expect(g?.contains).toEqual(['a', 'b']);
  });
  it('nested subgraphs warn and children land in the outer group', () => {
    const { doc, diagnostics } = fromMermaid([
      'flowchart LR',
      'subgraph outer [Outer]',
      '  subgraph inner [Inner]',
      '    a',
      '  end',
      '  b',
      'end',
    ].join('\n'));
    expect(codesOf(diagnostics)).toEqual(['M200']);
    expect(doc.objects.find((o) => o.id === 'outer')?.contains).toEqual(['a', 'b']);
    expect(doc.objects.find((o) => o.id === 'inner')).toBeUndefined();
  });
  it('subgraph used as an edge endpoint warns and is dropped', () => {
    const { doc, diagnostics } = fromMermaid([
      'flowchart LR',
      'subgraph sg [S]',
      '  a',
      'end',
      'sg --> b',
    ].join('\n'));
    expect(codesOf(diagnostics)).toEqual(['M200']);
    expect(doc.links).toEqual([]);
    expect(doc.objects.map((o) => o.id).sort()).toEqual(['a', 'b', 'sg']);
  });
});

describe('flowchart — unsupported constructs (FR-M5: never silent)', () => {
  it('classDef/class are mapped onto the object (FR-M3)', () => {
    const { doc, diagnostics } = fromMermaid([
      'flowchart TD',
      'classDef foo fill:#f9f,stroke:#333',
      'a[OK]',
      'class a foo',
    ].join('\n'));
    // colours are declared drops (M100); the class name round-trips as a tag
    expect(codesOf(diagnostics)).toEqual(['M100']);
    expect(doc.objects[0]?.style).toBeUndefined();
    expect(doc.objects[0]?.tags).toEqual(['foo']);
  });

  it('style/click still warn and are skipped', () => {
    const { doc, diagnostics } = fromMermaid([
      'flowchart TD',
      'style a fill:#f9f',
      'click a call callback()',
      'a[OK]',
    ].join('\n'));
    expect(codesOf(diagnostics)).toEqual(['M200', 'M200']);
    expect(doc.objects).toHaveLength(1);
  });

  it('linkStyle maps onto the import-ordered link', () => {
    const { doc, diagnostics } = fromMermaid([
      'flowchart TD',
      'a[A] --> b[B]',
      'linkStyle 0 stroke:#f00,stroke-dasharray: 4',
    ].join('\n'));
    expect(codesOf(diagnostics)).toEqual([]);
    expect(doc.links[0]?.style).toMatchObject({ stroke: '#f00', dashed: true });
  });
  it('%% comments are ignored silently (they are comments)', () => {
    const r = fromMermaid('flowchart TD\n%% a comment\na --> b\n');
    expect(r.diagnostics).toEqual([]);
  });
});

describe('C4 — element families', () => {
  it('maps System*/Container*/Component*/Person* to kinds', () => {
    const { doc } = fromC4([
      'C4Container',
      'Person(u, "User", "A human")',
      'Person_Ext(admin, "Admin")',
      'System(sys, "System", "desc")',
      'System_Ext(pay, "Stripe")',
      'SystemDb(db, "DB", "pg")',
      'SystemQueue(q, "Q")',
      'Container(web, "Web", "React", "SPA")',
      'Container_Ext(cdn, "CDN")',
      'ContainerDb(odb, "OldDB", "mysql", "legacy")',
      'ContainerQueue(cq, "Jobs", "sqs")',
      'Component(api, "API", "Go", "core")',
      'ComponentDb(cdb, "CDB", "sqlite")',
    ].join('\n'));
    expect(kinds(doc)).toEqual({
      u: 'person', admin: 'person', sys: 'system', pay: 'system_ext', db: 'datastore',
      q: 'queue', web: 'container', cdn: 'container', odb: 'datastore', cq: 'queue',
      api: 'component', cdb: 'datastore',
    });
    const admin = doc.objects.find((o) => o.id === 'admin');
    expect(admin?.tags).toEqual(['external']);
    const web = doc.objects.find((o) => o.id === 'web');
    expect(web?.name).toBe('Web');
    expect(web?.technology).toBe('React');
    expect(web?.description).toBe('SPA');
    expect(doc.objects.find((o) => o.id === 'u')?.description).toBe('A human');
  });
  it('C4Context sets level context', () => {
    expect(fromC4('C4Context\nPerson(u, "U")\n').doc.level).toBe('context');
    expect(fromC4('C4Container\nSystem(s, "S")\n').doc.level).toBe('container');
  });
  it('title directive becomes the doc title', () => {
    expect(fromC4('C4Context\ntitle My System\n').doc.title).toBe('My System');
  });
});

describe('C4 — relationships', () => {
  it('Rel maps to link with label and technology comment', () => {
    const { doc } = fromC4([
      'C4Context',
      'Person(u, "U")',
      'System(s, "S")',
      'Rel(u, s, "Uses", "HTTPS")',
    ].join('\n'));
    expect(doc.links).toHaveLength(1);
    expect(doc.links[0]?.from).toBe('u');
    expect(doc.links[0]?.to).toBe('s');
    expect(doc.links[0]?.label).toBe('Uses');
    expect(doc.links[0]?.comments).toEqual(['technology: HTTPS']);
  });
  it('Rel_Back reverses, BiRel sets bidir, RelIndex drops the index', () => {
    const { doc } = fromC4([
      'C4Container',
      'System(a, "A")',
      'System(b, "B")',
      'Rel_Back(a, b, "back")',
      'BiRel(a, b, "bi")',
      'RelIndex(1, a, b, "indexed")',
    ].join('\n'));
    expect(doc.links[0]?.from).toBe('b');
    expect(doc.links[0]?.to).toBe('a');
    expect(doc.links[1]?.bidir).toBe(true);
    expect(doc.links[2]?.label).toBe('indexed');
    expect(doc.links[2]?.from).toBe('a');
  });
});

describe('C4 — boundaries and ignored directives', () => {
  it('System_Boundary becomes a group with contains (brace form)', () => {
    const { doc, diagnostics } = fromC4([
      'C4Container',
      'Container_Boundary(b, "Backend") {',
      '  Component(api, "API")',
      '  Component(w, "Worker")',
      '}',
      'Container(fe, "Frontend")',
    ].join('\n'));
    expect(diagnostics).toEqual([]);
    const g = doc.objects.find((o) => o.id === 'b');
    expect(g?.kind).toBe('group');
    expect(g?.contains).toEqual(['api', 'w']);
  });
  it('Show*/Update*/Lay_*/skinparam are ignored with info diagnostics', () => {
    const { diagnostics } = fromC4([
      'C4Context',
      'Person(u, "U")',
      'Show_ExtBoundary()',
      'UpdatePersonStyle(u, $fontColor, "red")',
      'Lay_D(u, "D")',
      'skinparam backgroundColor white',
    ].join('\n'));
    expect(diagnostics).toHaveLength(4);
    expect(diagnostics.every((d) => d.code === 'M100' && d.severity === 'info')).toBe(true);
  });
  it('unknown lines warn (M200) but conversion continues', () => {
    const r = fromC4('C4Context\nPerson(u, "U")\nfrobnicate(u, 3)\n');
    expect(codesOf(r.diagnostics)).toEqual(['M200']);
    expect(r.doc.objects).toHaveLength(1);
  });
});

describe('converter output is valid PDL (round-trip invariant)', () => {
  it('flowchart output prints and reparses cleanly', () => {
    const { doc } = fromMermaid([
      'flowchart TD',
      'subgraph sg [Group]',
      '  a(rounded "thing")',
      '  b[rect]',
      'end',
      'a -->|uses| b --> c((person))',
      'c -.-> d[(db)]',
    ].join('\n'));
    const r = parsePDL(printDoc(doc));
    expect(r.diagnostics).toEqual([]);
    expect(r.doc).not.toBeNull();
  });
  it('C4 output prints and reparses cleanly', () => {
    const { doc } = fromC4([
      'C4Context',
      'title "Demo"',
      'Person(u, "User, plain")',
      'System_Ext(s, "External")',
      'Rel(u, s, "Talks", "gRPC")',
    ].join('\n'));
    const r = parsePDL(printDoc(doc));
    expect(r.diagnostics).toEqual([]);
    expect(r.doc).not.toBeNull();
  });
});
