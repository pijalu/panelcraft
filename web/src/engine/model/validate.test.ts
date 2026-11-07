// SPDX-License-Identifier: GPL-3.0-only
// Semantic validation tests (M1-WP4): one table per rule P100–P205, plus
// import-graph rules via a fake ImportSource (fs injected at the CLI layer).
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../format/parser';
import { validateDoc, type ImportSource } from './validate';
import type { Diagnostic } from '../format/diagnostics';

const v = (src: string, opts?: Parameters<typeof validateDoc>[1]): Diagnostic[] =>
  validateDoc(parsePDL(src).doc!, opts);

const codes = (src: string, opts?: Parameters<typeof validateDoc>[1]): string[] =>
  v(src, opts).map((d) => d.code);

/** In-memory import graph: graph[path] = imported paths; special lists misbehave. */
const srcOf = (
  graph: Record<string, string[]> = {},
  missing: string[] = [],
  escapes: string[] = [],
): ImportSource => ({
  classify: (_from, path) =>
    escapes.includes(path) ? { kind: 'escape' }
      : missing.includes(path) ? { kind: 'missing' }
        : { kind: 'ok', resolved: path },
  importsOf: (resolved) => graph[resolved] ?? [],
});

const HEAD = 'pcd 1.0\n';

describe('P100 duplicate ids', () => {
  it('flags duplicate object ids (second occurrence)', () => {
    const ds = v(`${HEAD}person a "A"\nsystem a "A2"\n`);
    expect(ds.filter((d) => d.code === 'P100')).toHaveLength(1);
    expect(ds.find((d) => d.code === 'P100')?.line).toBe(3);
  });
  it('flags duplicate flow and view ids', () => {
    const ds = v(`${HEAD}flow "F" as f1 { intro "x" }\nflow "G" as f1 { intro "y" }\nview "V" as v1 { layout auto LR }\nview "W" as v1 { layout auto LR }\n`);
    expect(ds.filter((d) => d.code === 'P100')).toHaveLength(2);
  });
  it('distinct ids are clean', () => {
    expect(codes(`${HEAD}person a "A"\nsystem b "B"\nflow "F" as f1 { intro "x" }\n`)).not.toContain('P100');
  });
});

describe('P101 unresolvable endpoints', () => {
  it('link endpoint unknown', () => {
    expect(codes(`${HEAD}person a "A"\na -> zz\n`)).toContain('P101');
  });
  it('link endpoint may be an import alias', () => {
    expect(codes(`${HEAD}import common as "../common/actors.pcd"\nperson a "A"\na -> common\n`)).not.toContain('P101');
  });
  it('msg-step endpoints unknown', () => {
    expect(codes(`${HEAD}person a "A"\nflow "F" { zz -> a : "go" }\n`)).toContain('P101');
  });
  it('process target unknown (the §14 checkout case)', () => {
    const ds = v(`${HEAD}person a "A"\nflow "F" { process mailx "send receipt" }\n`);
    expect(ds.filter((d) => d.code === 'P101')).toHaveLength(1);
  });
  it('endpoints inside alt branches are checked', () => {
    expect(codes(`${HEAD}person a "A"\nflow "F" { alt "x" { "b" { process deep "d" } } }\n`)).toContain('P101');
  });
});

describe('P102/P103/P200 import-graph rules', () => {
  it('detects a two-file cycle', () => {
    const ds = v(`${HEAD}import b as "b.pcd"\nperson a "A"\n`, {
      file: 'a.pcd',
      imports: srcOf({ 'b.pcd': ['a.pcd'] }),
    });
    expect(ds.filter((d) => d.code === 'P102')).toHaveLength(1);
    expect(ds.find((d) => d.code === 'P102')?.severity).toBe('error');
  });
  it('detects a self-cycle', () => {
    const ds = v(`${HEAD}import a as "a.pcd"\nperson x "X"\n`, {
      file: 'a.pcd',
      imports: srcOf({ 'a.pcd': ['a.pcd'] }),
    });
    expect(codes(`${HEAD}import a as "a.pcd"\nperson x "X"\n`, {
      file: 'a.pcd',
      imports: srcOf({ 'a.pcd': ['a.pcd'] }),
    })).toContain('P102');
    expect(ds).toBeDefined();
  });
  it('clean diamond is not a cycle', () => {
    expect(codes(`${HEAD}import b as "b.pcd"\nimport c as "c.pcd"\nperson a "A"\n`, {
      file: 'a.pcd',
      imports: srcOf({ 'b.pcd': ['d.pcd'], 'c.pcd': ['d.pcd'], 'd.pcd': [] }),
    })).not.toContain('P102');
  });
  it('workspace-escaping path → P103 error', () => {
    const ds = v(`${HEAD}import x as "../../../etc/passwd"\n`, {
      file: 'a.pcd',
      imports: srcOf({}, [], ['../../../etc/passwd']),
    });
    expect(ds.find((d) => d.code === 'P103')?.severity).toBe('error');
  });
  it('missing import file → P200 warning (still renderable)', () => {
    const ds = v(`${HEAD}import x as "nope.pcd"\n`, {
      file: 'a.pcd',
      imports: srcOf({}, ['nope.pcd']),
    });
    expect(ds.find((d) => d.code === 'P200')?.severity).toBe('warning');
  });
  it('without an ImportSource, import rules are skipped', () => {
    expect(codes(`${HEAD}import x as "../anything.pcd"\n`)).toEqual([]);
  });
});

describe('P104 msg-step ↔ link correspondence', () => {
  const pre = `${HEAD}person a "A"\ndatastore db "DB"\n`;
  it('no matching link pair (either direction) → P104', () => {
    expect(codes(`${pre}flow "F" { a -> db : "go" }\n`)).toContain('P104');
  });
  it('matching pair same direction → clean', () => {
    expect(codes(`${pre}a -> db\nflow "F" { a -> db : "go" }\n`)).not.toContain('P104');
  });
  it('matching pair reversed direction → clean', () => {
    expect(codes(`${pre}db -> a\nflow "F" { a -> db : "go" }\n`)).not.toContain('P104');
  });
  it('as-ref to unknown link id → P104', () => {
    expect(codes(`${pre}a -> db\nflow "F" { a -> db : "go" as L9 }\n`)).toContain('P104');
  });
  it('as-ref to existing link id → clean', () => {
    expect(codes(`${pre}a -> db as L1\nflow "F" { a -> db : "go" as L1 }\n`)).not.toContain('P104');
  });
});

describe('P105 group contains', () => {
  it('unknown contains id → P105', () => {
    expect(codes(`${HEAD}group g "G" { contains zz }\n`)).toContain('P105');
  });
  it('group inside group (nested) → P105', () => {
    expect(codes(`${HEAD}group g "G" { contains h }\ngroup h "H"\n`)).toContain('P105');
  });
  it('group containing a component → clean', () => {
    expect(codes(`${HEAD}group g "G" { contains c }\ncomponent c "C"\n`)).not.toContain('P105');
  });
});

describe('P106 note attach', () => {
  it('unknown attach target → P106', () => {
    expect(codes(`${HEAD}note n "N" { attach zz }\n`)).toContain('P106');
  });
  it('known attach target → clean', () => {
    expect(codes(`${HEAD}person a "A"\nnote n "N" { attach a }\n`).filter((c) => c !== 'P201')).not.toContain('P106');
  });
});

describe('P201 orphans', () => {
  it('unreferenced object → warning', () => {
    const ds = v(`${HEAD}person loner "L"\n`);
    expect(ds.find((d) => d.code === 'P201')?.severity).toBe('warning');
  });
  it('link-referenced object is not orphan', () => {
    expect(codes(`${HEAD}person a "A"\nperson b "B"\na -> b\n`)).not.toContain('P201');
  });
  it('flow-referenced object (process) is not orphan', () => {
    expect(codes(`${HEAD}person a "A"\nflow "F" { process a "run" }\n`)).not.toContain('P201');
  });
});

describe('P202 empty/visual-less flows', () => {
  it('zero steps → P202', () => {
    expect(codes(`${HEAD}flow "F" { }\n`)).toContain('P202');
  });
  it('only intro/conclusion → P202', () => {
    expect(codes(`${HEAD}flow "F" { intro "hi" }\n`)).toContain('P202');
  });
  it('with a visual step → clean (intro alone does not count)', () => {
    expect(codes(`${HEAD}person a "A"\nflow "F" { intro "hi"\nprocess a "run" }\n`)).not.toContain('P202');
  });
});

describe('P203 style targets', () => {
  it('unknown target → warning', () => {
    const ds = v(`${HEAD}person a "A"\nstyle zz { fill #111 }\n`);
    expect(ds.find((d) => d.code === 'P203')?.severity).toBe('warning');
  });
  it('known target → clean', () => {
    expect(codes(`${HEAD}person a "A"\nstyle a { fill #111 }\n`)).not.toContain('P203');
  });
});

describe('P204 position overlaps', () => {
  it('two objects at same coords → info', () => {
    const ds = v(`${HEAD}person a "A"\nperson b "B"\nview "V" { position a (10, 20)\nposition b (10, 20) }\n`);
    const p204 = ds.filter((d) => d.code === 'P204');
    expect(p204).toHaveLength(1);
    expect(p204[0]?.severity).toBe('info');
  });
  it('distinct coords → clean', () => {
    expect(codes(`${HEAD}person a "A"\nperson b "B"\nview "V" { position a (10, 20)\nposition b (30, 40) }\n`)).not.toContain('P204');
  });
});

describe('P205 unknown block attributes', () => {
  it('raw attribute in object → warning', () => {
    const ds = v('pcd 1.0\nperson a "A" {\n blur "2px"\n}\n');
    expect(ds.filter((d) => d.code === 'P205')).toHaveLength(1);
    expect(ds.find((d) => d.code === 'P205')?.severity).toBe('warning');
  });
  it('known attributes → clean', () => {
    expect(codes(`${HEAD}person a "A" { description "d"\ntag web\nicon cloud }\n`)).not.toContain('P205');
  });
});

describe('output discipline', () => {
  it('diagnostics are sorted by position', () => {
    const ds = v(`${HEAD}person loner "L"\nflow "F" { process zz "x" }\n`);
    const lines = ds.map((d) => d.line);
    expect([...lines].sort((x, y) => x - y)).toEqual(lines);
  });
  it('empty doc has no findings', () => {
    expect(v(`${HEAD}`)).toEqual([]);
  });
});
