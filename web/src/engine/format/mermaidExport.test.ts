// SPDX-License-Identifier: GPL-3.0-only
// Mermaid exporter tests (M4-WP5) — FILE-FORMAT §9 / SPEC FR-M4.
// Structure: (1) golden export.mmd per corpus file with a canonical.pcd —
// verified on every run, regenerated via `npm run corpus:accept`
// (EXPORT_FIXTURE=1); (2) unit tests for the kind→shape inverse table,
// declared feature drop, style/tag emission, import flattening; (3) re-import
// property test: exported text re-imports losslessly-to-declared-subset
// (FR-M5: conversion never silently loses declared-representable content).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { fromMermaid } from './mermaid';
import { docToMermaid } from './mermaidExport';
import type { Doc } from '../model/types';

const ROOT = join('testdata', 'corpus');
const ACCEPT = process.env['EXPORT_FIXTURE'] === '1';

const cases = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const loadCanonical = (c: string): Doc => {
  const { doc } = parsePDL(readFileSync(join(ROOT, c, 'canonical.pcd'), 'utf8'));
  expect(doc, `${c}: canonical.pcd must parse`).not.toBeNull();
  return doc!;
};

// ---- 1. goldens ---------------------------------------------------------------

describe('mermaid export goldens (per corpus file)', () => {
  for (const c of cases) {
    if (!existsSync(join(ROOT, c, 'canonical.pcd'))) continue;
    it(`export.mmd: ${c}`, () => {
      const out = docToMermaid(loadCanonical(c));
      const goldenPath = join(ROOT, c, 'export.mmd');
      if (ACCEPT) writeFileSync(goldenPath, out.text);
      expect(existsSync(goldenPath), `missing golden ${goldenPath} — run npm run corpus:accept`).toBe(true);
      expect(out.text).toBe(readFileSync(goldenPath, 'utf8'));
    });
  }
});

// ---- 2. kind→shape inverse table + declared drop ------------------------------

const docOf = (src: string): Doc => parsePDL(src).doc!;

describe('kind→shape inverse map (FILE-FORMAT §8 table inverted)', () => {
  const src = [
    'pcd 1.0',
    'person p "P"', 'system s "S"', 'system_ext x "X"', 'container c "C"',
    'component m "M"', 'datastore d "D"', 'queue q "Q"', 'note n "N"',
    'group g "G" { contains p }',
  ].join('\n');
  const text = docToMermaid(docOf(src)).text;

  it('maps every kind to its mermaid shape', () => {
    expect(text).toContain('p((P))'); // person → circle
    expect(text).toContain('s[S]'); // system → rect
    expect(text).toContain('x([X])'); // system_ext → stadium
    expect(text).toContain('c[C]'); // container → rect
    expect(text).toContain('m(M)'); // component → rounded
    expect(text).toContain('d[(D)]'); // datastore → cylinder
    expect(text).toContain('q>Q]'); // queue → asymmetric
    expect(text).toContain('n{N}'); // note → rhombus
    expect(text).toContain('subgraph g[G]'); // group → subgraph
    expect(text).toContain('p((P))\n'); // person also inside group block
  });

  it('always emits flowchart TD', () => {
    expect(text.startsWith('flowchart TD\n')).toBe(true);
  });

  it('sanitizes ids not matching [A-Za-z0-9_] (PDL allows dashes, mermaid-safe ids do not)', () => {
    const t = docToMermaid(docOf('pcd 1.0\nsystem a-b "X"')).text;
    expect(t).toContain('a_b[X]');
  });

  it('escapes double quotes in labels', () => {
    const t = docToMermaid(docOf('pcd 1.0\nsystem s "say \\"hi\\""')).text;
    expect(t).toContain('s[say &quot;hi&quot;]');
  });
});

describe('links: typed label prefix + bidir (§9)', () => {
  const src = [
    'pcd 1.0', 'system a "A"', 'system b "B"',
    'a -> b : "uses plainly"',
    'a -requests-> b : "POST /x" as L1',
    'a <-> b : "sync"',
    'a -uses-> b',
  ].join('\n');
  const text = docToMermaid(docOf(src)).text;

  it('keeps plain labels bare', () => {
    expect(text).toContain('a -->|uses plainly| b');
  });
  it('prefixes non-uses type into the label', () => {
    expect(text).toContain('a -->|requests: POST /x| b');
  });
  it('emits bidir arrows', () => {
    expect(text).toContain('a <-->|sync| b');
  });
  it('omits label for bare uses links', () => {
    expect(text).toContain('a --> b\n');
  });
});

describe('declared feature drop (FR-M4)', () => {
  it('reports drops present in the source, in fixed order', () => {
    const src = [
      'pcd 1.0',
      'title "T"',
      'theme dark',
      'level container',
      'direction LR',
      'person u "U" {',
      '  icon user',
      '  property owner "team"',
      '  description "d"',
      '  technology "Go"',
      '  blur "2px"',
      '}',
      'system s "S"',
      'note n "N" {',
      '  attach u',
      '}',
      'u -> s {',
      '  style { dashed }',
      '  anchor from 0.25',
      '  waypoint (1,2)',
      '}',
      'flow "F" as f {',
      '  info "x"',
      '}',
      'view "V" {',
      '  layout auto LR',
      '}',
      'style s {',
      '  fill #123456',
      '  stroke #000',
      '}',
    ].join('\n');
    const { text, dropped } = docToMermaid(docOf(src));
    expect(dropped).toEqual([
      'title', 'theme', 'level', 'direction (auto-layout)',
      'flows', 'views (positions/layout)', 'descriptions/technology',
      'properties', 'unknown attributes', 'icons', 'note anchors (detach)',
      'style beyond fill (stroke/text/shape)', 'endpoint perimeter anchors', 'waypoints',
      'system vs container kind distinction (both export as rect)',
    ]);
    // fill is emitted, stroke is not
    expect(text).toContain('style s fill:#123456');
    expect(text).not.toContain('#000');
  });

  it('declares the system→container rect aliasing when a system exists', () => {
    const { dropped } = docToMermaid(docOf('pcd 1.0\nsystem s "S"\ncontainer c "C"'));
    expect(dropped).toContain('system vs container kind distinction (both export as rect)');
  });

  it('emits no drop entry when nothing representable is lost', () => {
    const { dropped } = docToMermaid(docOf('pcd 1.0\ncontainer a "A"\ncontainer b "B"\na -> b'));
    expect(dropped).toEqual([]);
  });

  it('emits tags as classDef + class statements', () => {
    const text = docToMermaid(docOf('pcd 1.0\nsystem a "A" { tag core pci }\nsystem b "B" { tag core }')).text;
    expect(text).toContain('classDef core fill:#ffeeaa,stroke:#333;');
    expect(text).toContain('classDef pci fill:#ffeeaa,stroke:#333;');
    expect(text).toContain('class a core,pci;');
    expect(text).toContain('class b core;');
  });
});

describe('import flattening (§9: inlined + %% marked)', () => {
  const main = 'pcd 1.0\nimport lib as "./lib.pcd"\ncontainer a "A"\na -> lib_svc';
  it('inlines imported objects with alias_id and marks them', () => {
    const { text, dropped } = docToMermaid(docOf(main), {
      resolveImport: () => 'pcd 1.0\ncontainer svc "Service"',
    });
    expect(text).toContain('%% imported from ./lib.pcd');
    expect(text).toContain('lib_svc[Service]');
    expect(text).toContain('a --> lib_svc');
    expect(dropped).toEqual([]);
  });

  it('declares an unresolved import instead of dropping silently (FR-M5)', () => {
    const { text, dropped } = docToMermaid(docOf(main), { resolveImport: () => null });
    expect(text).toContain('%% import lib (./lib.pcd) unresolved — not inlined');
    expect(dropped).toEqual(['import lib (./lib.pcd) unresolved']);
  });

  it('inlines every imported object (all are referenceable/rendered in PDL); links not imported', () => {
    const { text } = docToMermaid(docOf(main), {
      resolveImport: () => 'pcd 1.0\ncontainer svc "S"\ncontainer other "O"\nsvc -> other',
    });
    expect(text).toContain('lib_svc[S]');
    expect(text).toContain('lib_other[O]');
    expect(text).not.toContain('svc --> other');
  });
});

// ---- 3. re-import property (lossless to declared subset) ----------------------

const san = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, '_');

const assertObjectsSurvive = (doc: Doc, back: Doc): Set<string> => {
  const byId = new Map(back.objects.map((o) => [o.id, o]));
  const seen = new Set<string>();
  for (const o of doc.objects) {
    const sid = san(o.id);
    if (seen.has(sid)) continue;
    seen.add(sid);
    const got = byId.get(sid);
    expect(got, `object ${o.id} survives`).toBeDefined();
    expect(got!.kind, `kind of ${o.id} via shape inverse`).toBe(o.kind === 'system' ? 'container' : o.kind);
    expect(got!.name ?? got!.id, `name of ${o.id}`).toBe(o.name ?? o.id);
    if (o.kind === 'group') {
      // nested groups are a declared drop — compare direct non-group members
      const nonGroup = (o.contains ?? [])
        .filter((cid) => doc.objects.find((x) => x.id === cid)?.kind !== 'group')
        .map(san)
        .sort();
      expect([...(got!.contains ?? [])].sort(), `contains of ${o.id}`).toEqual(nonGroup);
    }
  }
  return seen;
};

const assertLinksSurvive = (doc: Doc, back: Doc): void => {
  // links with group endpoints are a declared drop (§8: subgraph cannot be
  // an edge endpoint) — excluded from the round-trip assertion
  const groupIds = new Set(doc.objects.filter((o) => o.kind === 'group').map((o) => o.id));
  const links = doc.links.filter((l) => !groupIds.has(l.from) && !groupIds.has(l.to));
  expect(back.links.length, 'link count').toBe(links.length);
  for (const l of links) {
    const got = back.links.find(
      (b) => b.from === san(l.from) && b.to === san(l.to) && (b.bidir ?? false) === (l.bidir ?? false),
    );
    expect(got, `link ${l.from}->${l.to} survives`).toBeDefined();
    const labelParts: string[] = [];
    if (l.type && l.type !== 'uses') labelParts.push(`${l.type}:`);
    if (l.label) labelParts.push(l.label);
    if (labelParts.length > 0) expect(got!.label).toBe(labelParts.join(' '));
  }
};

describe('re-import property: export → fromMermaid is lossless on the declared subset', () => {
  for (const c of cases) {
    if (!existsSync(join(ROOT, c, 'canonical.pcd'))) continue;
    it(`round trip: ${c}`, () => {
      const doc = loadCanonical(c);
      const { text } = docToMermaid(doc);
      const back = fromMermaid(text).doc;

      // Objects: every exported object (deduped by sanitized id — mermaid node
      // ids are unique, so duplicate-id docs keep their first definition) must
      // re-import with id/name/kind intact (system exports as rect → container,
      // the declared §8 aliasing; every other kind round-trips exactly).
      const seen = assertObjectsSurvive(doc, back);
      // endpoints referenced by links but without an object statement: the
      // §8 import creates implicit container nodes for them (same on re-import)
      const implicit = new Set(
        doc.links
          .flatMap((l) => [l.from, l.to])
          .filter((id) => !doc.objects.some((o) => o.id === id))
          .map(san),
      );
      expect(back.objects.length, 'no phantom objects beyond implicit endpoints').toBe(
        seen.size + implicit.size,
      );
      assertLinksSurvive(doc, back);
    });
  }
});
