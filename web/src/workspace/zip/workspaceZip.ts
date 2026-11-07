// SPDX-License-Identifier: GPL-3.0-only
// M3-WP3: workspace ⇄ ZIP entry conversion + `panelcraft.workspace.json`
// manifest (FR-W5). Round-trips must be lossless (S4).
import {
  createFolder, filesUnder, MANIFEST_NAME, newRoot, readFile, walkNodes,
  writeFile, type FsNode,
} from '../fs';
import type { ZipEntry } from './zip';
import { IR_VERSION } from '../../engine/model/types';

export interface WorkspaceManifest {
  app: 'panelcraft';
  manifestVersion: 1;
  name: string;
  savedAt: number;
  irVersion: number;
  /** Sorted file paths contained in the archive (no manifest entry itself). */
  files: string[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Snapshot the workspace tree into ZIP entries (+ manifest by default). */
export function treeToEntries(
  root: FsNode,
  opts: { name?: string; manifest?: boolean; savedAt?: number } = {},
): ZipEntry[] {
  const entries: ZipEntry[] = [];
  for (const { path, node } of walkNodes(root)) {
    if (node.kind === 'folder') entries.push({ name: `${path}/`, data: null });
    else entries.push({ name: path, data: encoder.encode(node.content ?? '') });
  }
  if (opts.manifest !== false) {
    const manifest: WorkspaceManifest = {
      app: 'panelcraft',
      manifestVersion: 1,
      name: opts.name ?? 'workspace',
      savedAt: opts.savedAt ?? 0,
      irVersion: IR_VERSION,
      files: filesUnder(root).map((e) => e.path).sort(),
    };
    entries.push({
      name: MANIFEST_NAME,
      data: encoder.encode(JSON.stringify(manifest, null, 2)),
    });
  }
  return entries;
}

export interface WorkspaceArchive {
  root: FsNode;
  manifest: WorkspaceManifest | null;
}

/** Rebuild a workspace tree from unpacked ZIP entries (lossless inverse). */
export function entriesToTree(entries: ZipEntry[]): WorkspaceArchive {
  const root = newRoot();
  let manifest: WorkspaceManifest | null = null;
  for (const entry of entries) {
    const isDir = entry.name.endsWith('/');
    const path = isDir ? entry.name.slice(0, -1) : entry.name;
    if (path === MANIFEST_NAME) {
      manifest = parseManifest(decoder.decode(entry.data ?? new Uint8Array()));
      continue;
    }
    if (isDir) {
      if (path !== '') createFolder(root, path);
      continue;
    }
    writeFile(root, path, decoder.decode(entry.data ?? new Uint8Array()));
  }
  return { root, manifest };
}

function parseManifest(text: string): WorkspaceManifest | null {
  try {
    const raw = JSON.parse(text) as Partial<WorkspaceManifest> | null;
    if (raw?.app !== 'panelcraft') return null;
    if (raw.manifestVersion !== 1) return null;
    if (typeof raw.name !== 'string') return null;
    if (!Array.isArray(raw.files)) return null;
    return {
      app: 'panelcraft',
      manifestVersion: 1,
      name: raw.name,
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      irVersion: typeof raw.irVersion === 'number' ? raw.irVersion : IR_VERSION,
      files: raw.files as string[],
    };
  } catch {
    return null; // broken manifest: archive still imports, without metadata
  }
}

/** Convenience for S4: file content equality helper used by tests/e2e. */
export function snapshotTree(root: FsNode): Array<{ path: string; content: string }> {
  return filesUnder(root).map(({ path }) => ({ path, content: readFile(root, path) }));
}
