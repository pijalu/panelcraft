// SPDX-License-Identifier: GPL-3.0-only
// Transitive embedding is a pure graph transform over a WorkspaceReader: no
// partial export, no workspace mutation and deterministic canonical bytes.
import { describe, expect, it } from 'vitest';
import { hasLinkedDecomposition, planEmbeddedExport, type WorkspaceReader } from './embed';

const reader = (files: Record<string, string>): WorkspaceReader => ({
  files: () => Object.entries(files).map(([path, text]) => ({ path, text })),
  text: (path) => files[path] ?? null,
});

const codes = (diagnostics: readonly { code: string }[]): string[] => diagnostics.map((d) => d.code);

describe('transitive embedded export', () => {
  it('embeds every reachable descendant in deterministic, non-mutating bytes', () => {
    const files: Record<string, string> = {
      'root.pcd': `pcd 1.0
level context
system a "A" {
  drilldown "child.pcd"
}
`,
      'child.pcd': `pcd 1.0
level container
container b "B" {
  drilldown "grand.pcd"
}
`,
      'grand.pcd': `pcd 1.0
level component
component c "C"
`,
      'unrelated.pcd': `pcd 1.0
level context
person z "Z"
`,
    };
    const ws = reader(files);
    const before = JSON.stringify(files);
    const first = planEmbeddedExport('root.pcd', ws);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.diagnostics[0]?.message ?? 'export failed');
    expect(first.plan.docs.map((d) => d.path)).toEqual(['child.pcd', 'grand.pcd']);
    expect(first.plan.text).toContain('drilldown embedded "child.pcd" {');
    expect(first.plan.text).toContain('drilldown embedded "grand.pcd" {');
    expect(first.plan.text).not.toContain('unrelated.pcd');
    expect(planEmbeddedExport('root.pcd', ws)).toEqual(first);
    expect(JSON.stringify(files)).toBe(before);
  });

  it('detects linked targets reachable through an already embedded child', () => {
    const ws = reader({
      'root.pcd': `pcd 1.0
system a "A" {
  drilldown embedded "child.pcd" {
    pcd 1.0
    level container
    container b "B" {
      drilldown "grand.pcd"
    }
  }
}
`,
      'grand.pcd': `pcd 1.0\nlevel component\ncomponent c "C"\n`,
    });
    expect(hasLinkedDecomposition('root.pcd', ws)).toBe(true);
    const rootOnly = reader({
      'root.pcd': `pcd 1.0
system a "A" {
  drilldown embedded "child.pcd" {
    pcd 1.0
    level container
    container b "B"
  }
}
`,
    });
    expect(hasLinkedDecomposition('root.pcd', rootOnly)).toBe(false);
  });

  it('fails as a unit on missing, unparsable, invalid, cyclic and shared children', () => {
    const cases: Array<[string, Record<string, string>, string]> = [
      ['missing', { 'root.pcd': 'pcd 1.0\nsystem a "A" {\n  drilldown "gone.pcd"\n}\n' }, 'P212'],
      ['unparsable', {
        'root.pcd': 'pcd 1.0\nsystem a "A" {\n  drilldown "child.pcd"\n}\n',
        'child.pcd': 'this is not pcd\n',
      }, 'E103'],
      ['invalid', {
        'root.pcd': 'pcd 1.0\nsystem a "A" {\n  drilldown "child.pcd"\n}\n',
        'child.pcd': 'pcd 1.0\nlevel container\nperson p "P" {\n  drilldown "x.pcd"\n}\n',
      }, 'P215'],
      ['cyclic', {
        'root.pcd': 'pcd 1.0\nsystem a "A" {\n  drilldown "child.pcd"\n}\n',
        'child.pcd': 'pcd 1.0\nlevel container\nsystem b "B" {\n  drilldown "root.pcd"\n}\n',
      }, 'P220'],
      ['shared', {
        'root.pcd': `pcd 1.0
system a "A" {
  drilldown "child.pcd"
}
system b "B" {
  drilldown "child.pcd"
}
`,
        'child.pcd': 'pcd 1.0\nlevel container\ncontainer c "C"\n',
      }, 'P219'],
    ];
    for (const [name, files, code] of cases) {
      const result = planEmbeddedExport('root.pcd', reader(files));
      expect(result.ok, name).toBe(false);
      if (result.ok) continue;
      expect(codes(result.diagnostics), name).toContain(code);
    }
  });

  it('reports an unreadable descendant instead of silently skipping it', () => {
    const ws: WorkspaceReader = {
      files: () => [],
      text: (path) => {
        if (path === 'root.pcd') return 'pcd 1.0\nsystem a "A" {\n  drilldown "locked.pcd"\n}\n';
        throw new Error('storage denied');
      },
    };
    const result = planEmbeddedExport('root.pcd', ws);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.diagnostics)).toContain('P222');
  });
});
