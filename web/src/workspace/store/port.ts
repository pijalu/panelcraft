// SPDX-License-Identifier: GPL-3.0-only
// M3-WP2: Storage port + stored-record schema (forward-only migrations, FR-S5).
// Consumers depend on this port, never on IndexedDB directly (agents.md SOLID).

import { IR_VERSION } from '../../engine/model/types';
import { newRoot, type FsNode } from '../fs';

/**
 * Storage schema version — independent of IR_VERSION (which tracks the PDL IR).
 * Bump + add a migration step when the record layout changes (forward-only).
 */
export const SCHEMA_VERSION = 2;

/** Persisted UI preferences (F-10/F-11): layout, widths, section state. */
export interface WorkspaceSettings {
  /** Opaque to the store — validated by `ui/uiLayout.ts` on read. */
  layout?: unknown;
  /** Versioned application-only theme; validated by `ui/appTheme.ts`. */
  appTheme?: unknown;
}

/** Stored workspace record (object store value). v2 layout. */
export interface StoredWorkspace {
  schemaVersion: number;
  /** UI preferences; absent in v1 records (migration seeds `{}`). */
  settings: WorkspaceSettings;
  /** IR version the tree was authored against (informational; see M3.md). */
  irVersion: number;
  savedAt: number;
  name: string;
  /** Workspace root node (kind 'folder'). */
  tree: FsNode;
  /** Paths of open tabs at save time (FR-S1 restore). */
  openTabs: string[];
  /** Active tab path or null. */
  activePath: string | null;
}

export type StoreErrorCode = 'quota' | 'corrupt' | 'newer-schema' | 'unavailable';

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message?: string,
  ) {
    super(message ?? `store: ${code}`);
    this.name = 'StoreError';
  }
}

/** Storage port — browser-local only, nothing server-side (ADR-0003, FR-S1). */
export interface StoragePort {
  /** Last stored workspace, or null when none. Throws StoreError. */
  load(): Promise<StoredWorkspace | null>;
  /** Persist; throws StoreError('quota') on QuotaExceededError. */
  save(ws: StoredWorkspace): Promise<void>;
  /** Remove all app data (FR-S4). */
  clear(): Promise<void>;
  /** Best-effort usage estimate in bytes, or null when unavailable (FR-S3). */
  estimate(): Promise<number | null>;
}

export function newStoredWorkspace(name = 'workspace'): StoredWorkspace {
  return {
    schemaVersion: SCHEMA_VERSION,
    irVersion: IR_VERSION,
    savedAt: 0,
    name,
    tree: newRoot(),
    openTabs: [],
    activePath: null,
    settings: {},
  };
}

/** Map a storage failure to StoreError; QuotaExceededError ⇒ 'quota' (FR-S3). */
export function mapStoreError(err: unknown): StoreError {
  if (err instanceof StoreError) return err;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new StoreError('quota', 'storage quota exceeded');
  }
  return new StoreError('unavailable', err instanceof Error ? err.message : String(err));
}

type RawRecord = Record<string, unknown>;
const isObj = (v: unknown): v is RawRecord => typeof v === 'object' && v !== null;

/**
 * Forward-only migration chain: key = record version, value = upgrade to key+1.
 * Every step must tolerate already-migrated input via spread semantics.
 */
export const MIGRATIONS: Record<number, (r: RawRecord) => RawRecord> = {
  // v0 (pre-M3 sketches had no tab state) → v1: default tab fields.
  0: (r) => ({ openTabs: [], activePath: null, ...r, schemaVersion: 1 }),
  // v1 → v2 (F-10): UI settings live with the workspace record.
  1: (r) => ({ settings: {}, ...r, schemaVersion: 2 }),
};

function assertUsableVersion(raw: RawRecord): number {
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new StoreError('corrupt', 'missing/invalid schemaVersion');
  }
  if (version > SCHEMA_VERSION) {
    throw new StoreError('newer-schema', `stored schema v${version} > app v${SCHEMA_VERSION}`);
  }
  return version;
}

function migrateRecord(raw: RawRecord, version: number): RawRecord {
  let rec = raw;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new StoreError('corrupt', `no migration from v${v}`);
    rec = step(rec);
  }
  return rec;
}

function assertTree(rec: RawRecord): FsNode {
  const tree = rec.tree;
  if (!isObj(tree) || tree.kind !== 'folder' || !Array.isArray(tree.children)) {
    throw new StoreError('corrupt', 'stored tree is not a workspace root');
  }
  return tree as unknown as FsNode;
}

/** Field-level checks + normalization of a fully migrated record. */
function toStored(rec: RawRecord): StoredWorkspace {
  const tree = assertTree(rec);
  if (typeof rec.name !== 'string') throw new StoreError('corrupt', 'missing workspace name');
  if (!Array.isArray(rec.openTabs)) throw new StoreError('corrupt', 'openTabs must be an array');
  if (rec.activePath !== null && typeof rec.activePath !== 'string') {
    throw new StoreError('corrupt', 'activePath must be a string or null');
  }
  const settings = isObj(rec.settings) ? (rec.settings as WorkspaceSettings) : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    irVersion: typeof rec.irVersion === 'number' ? rec.irVersion : IR_VERSION,
    savedAt: typeof rec.savedAt === 'number' ? rec.savedAt : 0,
    name: rec.name,
    tree,
    openTabs: rec.openTabs as string[],
    activePath: rec.activePath as string | null,
    settings,
  };
}

/**
 * Validate + migrate a raw record from storage to SCHEMA_VERSION.
 * Throws StoreError('corrupt') for unusable data, StoreError('newer-schema')
 * when written by a newer app (forward-only ⇒ never down-migrate).
 */
export function decodeStored(raw: unknown): StoredWorkspace {
  if (!isObj(raw)) throw new StoreError('corrupt', 'stored record is not an object');
  return toStored(migrateRecord(raw, assertUsableVersion(raw)));
}
