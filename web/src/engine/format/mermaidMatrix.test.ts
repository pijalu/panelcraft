// SPDX-License-Identifier: GPL-3.0-only
// F-21: the committed mermaid matrix must match the converters' declared
// catalogues, and every declared drop must be reachable/believable.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mermaidMatrix } from './mermaidMatrix';
import { C4_DROP_CATALOGUE, docToC4 } from './mermaidC4';
import { EXPORT_DROP_CATALOGUE, UNRESOLVED_IMPORT_PREFIX, docToMermaid } from './mermaidExport';
import { parsePDL } from './parser';

const PATH = join('docs', 'MERMAID-MATRIX.md');

describe('mermaid matrix (F-21)', () => {
  it('the committed document matches the generated one', () => {
    const generated = mermaidMatrix();
    if (process.env.MERMAID_MATRIX === '1') {
      writeFileSync(PATH, generated);
      return;
    }
    expect(readFileSync(PATH, 'utf8')).toBe(generated);
  });

  it('documents every export drop the exporter can report', () => {
    const doc = mermaidMatrix();
    for (const drop of EXPORT_DROP_CATALOGUE) expect(doc).toContain(drop);
    for (const drop of C4_DROP_CATALOGUE) expect(doc).toContain(drop);
  });

  it('a maximal document only reports catalogue entries', () => {
    const { doc } = parsePDL(
      'pcd 1.0\ntitle "T"\ntheme dark\nlevel container\ndirection LR\n\n' +
        'import i as "./x.pcd"\n\n' +
        'person a "A" {\n  description "d"\n  properties\n}\n' +
        'system b "B" {\n  technology "Go"\n  property k "v"\n  icon cloud\n  glow "x"\n  z 2\n  style {\n    stroke #fff\n  }\n}\n' +
        'datastore c "C"\nqueue d "D"\nsystem_ext e "E"\ncontainer f "F"\ncomponent g "G"\n' +
        'group grp "G" {\n  contains a b\n}\nnote n "memo" {\n  attach a\n}\n\n' +
        'a -> b as L1 {\n  waypoint (1, 2)\n}\n\n' +
        'flow "F" {\n  intro "x"\n}\n\n' +
        'view "V" {\n  position a (1, 2)\n}\n',
    );
    expect(doc).not.toBeNull();
    const exported = docToMermaid(doc!, {});
    for (const drop of exported.dropped) {
      const known =
        drop.startsWith(UNRESOLVED_IMPORT_PREFIX) ||
        EXPORT_DROP_CATALOGUE.some((d) => drop.startsWith(d));
      expect(known, `undocumented drop: ${drop}`).toBe(true);
    }
  });

  it('C4 export maps kinds and reports its own drops', () => {
    const { doc } = parsePDL(
      'pcd 1.0\nperson a "A"\nsystem b "B" {\n  style {\n    fill #111\n  }\n}\n' +
        'group g "G" {\n  contains a\n}\nnote n "m"\n\na -> b : "uses"\n\nflow "F" {\n  intro "x"\n}\n',
    );
    const out = docToC4(doc!);
    expect(out.text).toContain('C4Context');
    expect(out.text).toContain('Person(a, "A")');
    expect(out.text).toContain('System(b, "B")');
    expect(out.text).toContain('Rel(a, b, "uses")');
    expect(out.text).not.toContain('groups');
    for (const drop of out.dropped) {
      expect(C4_DROP_CATALOGUE).toContain(drop);
    }
  });
});
