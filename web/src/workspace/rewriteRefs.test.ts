// SPDX-License-Identifier: GPL-3.0-only
// Rename/move maintenance for decomposition links (IR v10, §3.2): a moved target
// must not leave every parent pointing at a path that no longer exists.
import { describe, expect, it } from 'vitest';
import { WorkspaceManager } from './workspace';
import { relativePath, rewriteDrilldownPaths } from './rewriteRefs';

describe('relativePath', () => {
  it('spells a sibling, child and parent target the way the format needs', () => {
    expect(relativePath('systems/shop.pcd', 'containers/shop.pcd')).toBe('../containers/shop.pcd');
    expect(relativePath('systems/shop.pcd', 'systems/children/api.pcd')).toBe('children/api.pcd');
    expect(relativePath('a/b/c.pcd', 'a/b/d.pcd')).toBe('d.pcd');
    expect(relativePath('root.pcd', 'deep/nested/x.pcd')).toBe('deep/nested/x.pcd');
  });
});

describe('rewriteDrilldownPaths', () => {
  const files = [
    { path: 'systems/shop.pcd', text: 'pcd 1.0\nsystem shop "Shop" {\n  drilldown "../containers/shop.pcd"\n}\n' },
    { path: 'other/ref.pcd', text: 'pcd 1.0\nsystem s "S" {\n  drilldown "../containers/shop.pcd" view containers\n}\n' },
    { path: 'unrelated.pcd', text: 'pcd 1.0\nsystem u "U" {\n  drilldown "elsewhere.pcd"\n}\n' },
  ];

  it('re-points every reference to the renamed diagram and nothing else', () => {
    const out = rewriteDrilldownPaths(files, 'containers/shop.pcd', 'containers/webshop.pcd');
    expect(out.map((f) => f.changed)).toEqual([true, true, false]);
    expect(out[0]?.text).toContain('drilldown "../containers/webshop.pcd"');
    expect(out[1]?.text).toContain('drilldown "../containers/webshop.pcd" view containers');
    expect(out[0]?.text).not.toContain('webshop.pcd" view');
    expect(out[2]?.text).toBe(files[2]?.text);
  });

  it('keeps a move into a deeper folder readable', () => {
    const out = rewriteDrilldownPaths(files, 'containers/shop.pcd', 'diagrams/containers/shop.pcd');
    expect(out[0]?.text).toContain('drilldown "../diagrams/containers/shop.pcd"');
  });
});

describe('WorkspaceManager rename/move', () => {
  const manager = (): WorkspaceManager => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('systems/shop.pcd', 'pcd 1.0\nsystem shop "Shop" {\n  drilldown "../containers/shop.pcd"\n}\n');
    ws.createFileAt('containers/shop.pcd', 'pcd 1.0\ncontainer api "API"\n');
    return ws;
  };

  it('rewrites the parent when the child diagram is renamed', () => {
    const ws = manager();
    ws.renamePath('containers/shop.pcd', 'shop-containers.pcd');
    expect(ws.text('systems/shop.pcd')).toContain('drilldown "../containers/shop-containers.pcd"');
    expect(ws.hasFile('containers/shop-containers.pcd')).toBe(true);
  });

  it('rewrites the parent when the child diagram moves to another folder', () => {
    const ws = manager();
    ws.createFolderAt('diagrams');
    ws.movePath('containers/shop.pcd', 'diagrams');
    expect(ws.text('systems/shop.pcd')).toContain('drilldown "../diagrams/shop.pcd"');
  });
});
