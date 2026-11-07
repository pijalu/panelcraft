// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import { packZip, unpackZip } from './zip';
import { treeToEntries, entriesToTree, snapshotTree } from './workspaceZip';
import { createFile, deleteNode, MANIFEST_NAME, newRoot } from '../fs';

function sampleTree() {
  const root = newRoot();
  createFile(root, 'svc/api/main.pcd', 'sys "api" {}');
  createFile(root, 'svc/api/детали.pcd', '# юникод ✓');
  createFile(root, 'root.pcd', '');
  createFolderEmpty(root, 'docs/drafts'); // empty folder must survive
  return root;
}

function createFolderEmpty(root: Parameters<typeof createFile>[0], path: string): void {
  createFile(root, `${path}/.tmp`);
  deleteNode(root, `${path}/.tmp`);
}

describe('workspace ZIP round-trip (FR-W5, S4 core)', () => {
  it('tree → entries → zip → entries → tree is lossless', async () => {
    const root = sampleTree();
    const zip = await packZip(treeToEntries(root, { name: 'demo', savedAt: 123 }));
    const { root: back, manifest } = entriesToTree(await unpackZip(zip));
    expect(snapshotTree(back)).toEqual(snapshotTree(root));
    expect(manifest).not.toBeNull();
    expect(manifest?.name).toBe('demo');
    expect(manifest?.savedAt).toBe(123);
    expect(manifest?.app).toBe('panelcraft');
    expect(manifest?.files.sort()).toEqual(snapshotTree(root).map((f) => f.path).sort());
  });

  it('includes the manifest entry and empty-folder entries', async () => {
    const root = sampleTree();
    const entries = treeToEntries(root);
    const names = entries.map((e) => e.name).sort();
    expect(names).toContain(MANIFEST_NAME);
    expect(names).toContain('docs/');
    expect(names).toContain('docs/drafts/');
    const manifest = entries.find((e) => e.name === MANIFEST_NAME)!;
    const parsed = JSON.parse(new TextDecoder().decode(manifest.data!));
    expect(parsed.manifestVersion).toBe(1);
    expect(parsed.files).toEqual(['root.pcd', 'svc/api/main.pcd', 'svc/api/детали.pcd'].sort());
  });

  it('manifest can be omitted (plain folder layout)', () => {
    const names = treeToEntries(sampleTree(), { manifest: false }).map((e) => e.name);
    expect(names).not.toContain(MANIFEST_NAME);
  });

  it('imports archives without a manifest (metadata simply absent)', async () => {
    const zip = await packZip([{ name: 'only.pcd', data: new TextEncoder().encode('x') }]);
    const { root, manifest } = entriesToTree(await unpackZip(zip));
    expect(manifest).toBeNull();
    expect(snapshotTree(root)).toEqual([{ path: 'only.pcd', content: 'x' }]);
  });

  it('a broken manifest still imports the tree', async () => {
    const zip = await packZip([
      { name: MANIFEST_NAME, data: new TextEncoder().encode('{not json') },
      { name: 'a.pcd', data: new TextEncoder().encode('y') },
    ]);
    const { root, manifest } = entriesToTree(await unpackZip(zip));
    expect(manifest).toBeNull();
    expect(snapshotTree(root)).toEqual([{ path: 'a.pcd', content: 'y' }]);
  });

  it('a foreign manifest (wrong app) is ignored', async () => {
    const zip = await packZip([
      { name: MANIFEST_NAME, data: new TextEncoder().encode(JSON.stringify({ app: 'other' })) },
    ]);
    const { manifest } = entriesToTree(await unpackZip(zip));
    expect(manifest).toBeNull();
  });
});
