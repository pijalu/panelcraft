// SPDX-License-Identifier: GPL-3.0-only
// Workspace hierarchy audit (IR v10): per-file rules come from the engine; what
// only a workspace can see is a child claimed by two different files, which the
// shell reports as P211 on the open one.
import { describe, expect, it } from 'vitest';
import { auditHierarchy } from './hierarchyAudit';

const parent = (target: string, id = 'shop'): string =>
  `pcd 1.0\nsystem ${id} "Shop" {\n  drilldown "${target}"\n}\n`;

const child = (level: string): string => `pcd 1.0\nlevel ${level}\ncontainer api "API"\n`;

const files = (): { path: string; text: string }[] => [
  { path: 'a/context.pcd', text: parent('../children/shop.pcd') },
  { path: 'b/context.pcd', text: parent('../children/shop.pcd', 'shop2') },
  { path: 'children/shop.pcd', text: child('container') },
];

describe('auditHierarchy', () => {
  it('reports a child claimed by two different files', () => {
    const diags = auditHierarchy(files(), 'a/context.pcd');
    const dup = diags.filter((d) => d.code === 'P211');
    expect(dup).toHaveLength(1);
    expect(dup[0]?.message).toContain('b/context.pcd');
  });

  it('stays quiet when the workspace declares one parent', () => {
    const one = files().filter((f) => f.path !== 'b/context.pcd');
    expect(auditHierarchy(one, 'a/context.pcd')).toHaveLength(0);
  });

  it('carries the engine rules for the open file (missing target warning)', () => {
    const gone = [{ path: 'a/context.pcd', text: parent('../children/gone.pcd') }];
    expect(auditHierarchy(gone, 'a/context.pcd').map((d) => d.code)).toContain('P212');
  });

  it('reports nothing without an open or parseable file', () => {
    expect(auditHierarchy(files(), null)).toEqual([]);
    expect(auditHierarchy([{ path: 'x.pcd', text: 'not pdl' }], 'x.pcd')).toEqual([]);
  });
});
