// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION, newStoredWorkspace, decodeStored, mapStoreError,
  MIGRATIONS, StoreError,
} from './port';
import { createFile } from '../fs';

const validV1 = () => {
  const rec = newStoredWorkspace('demo');
  rec.savedAt = 1234;
  createFile(rec.tree, 'a/b.pcd', 'x');
  rec.openTabs = ['a/b.pcd'];
  rec.activePath = 'a/b.pcd';
  return rec;
};

describe('schema v2 migration (F-10 settings)', () => {
  it('adds an empty settings object to a v1 record', () => {
    const v1 = {
      schemaVersion: 1,
      irVersion: 1,
      savedAt: 1,
      name: 'w',
      tree: { kind: 'folder', name: 'root', children: [] },
      openTabs: [],
      activePath: null,
    };
    const rec = decodeStored(v1);
    expect(rec.schemaVersion).toBe(2);
    expect(rec.settings).toEqual({});
  });

  it('keeps stored settings through decode', () => {
    const v2 = {
      schemaVersion: 2,
      irVersion: 2,
      savedAt: 1,
      name: 'w',
      tree: { kind: 'folder', name: 'root', children: [] },
      openTabs: [],
      activePath: null,
      settings: { layout: { panels: { sidebar: 'collapsed' } } },
    };
    expect(decodeStored(v2).settings.layout).toEqual({ panels: { sidebar: 'collapsed' } });
  });
});

describe('decodeStored (schema v1)', () => {
  it('passes a valid record through and normalizes fields', () => {
    const out = decodeStored(validV1());
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.openTabs).toEqual(['a/b.pcd']);
    expect(out.tree.children?.[0]?.name).toBe('a');
  });

  it('migrates v0 records forward-only (adds tab state)', () => {
    const v0 = {
      schemaVersion: 0,
      name: 'old',
      tree: { kind: 'folder', name: '', children: [] },
    };
    const out = decodeStored(v0);
    // forward-only chain v0 → v1 (tabs) → v2 (settings)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.settings).toEqual({});
    expect(out.openTabs).toEqual([]);
    expect(out.activePath).toBeNull();
    expect(out.name).toBe('old');
  });

  it('refuses newer schemas (forward-only, never down-migrate)', () => {
    const newer = { ...validV1(), schemaVersion: SCHEMA_VERSION + 1 };
    expectCode(() => decodeStored(newer), 'newer-schema');
  });

  it('flags corrupt records: non-object, bad version, bad tree, bad name/tabs', () => {
    expectCode(() => decodeStored(null), 'corrupt');
    expectCode(() => decodeStored('x'), 'corrupt');
    expectCode(() => decodeStored({}), 'corrupt');
    expectCode(() => decodeStored({ schemaVersion: 'x' }), 'corrupt');
    expectCode(() => decodeStored({ schemaVersion: 1, tree: { kind: 'file' } }), 'corrupt');
    expectCode(() => decodeStored({ ...validV1(), name: 42 }), 'corrupt');
    expectCode(() => decodeStored({ ...validV1(), openTabs: 'a' }), 'corrupt');
    expectCode(() => decodeStored({ ...validV1(), activePath: 7 }), 'corrupt');
  });
});

describe('mapStoreError', () => {
  it('maps QuotaExceededError to quota; wraps the rest as unavailable', () => {
    const quota = mapStoreError(Object.assign(new Error('q'), { name: 'QuotaExceededError' }));
    expect(quota.code).toBe('quota');
    expect(mapStoreError(new StoreError('corrupt')).code).toBe('corrupt');
    expect(mapStoreError(new Error('boom')).code).toBe('unavailable');
    expect(mapStoreError('boom').code).toBe('unavailable');
  });
});

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected StoreError ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(StoreError);
    expect((e as StoreError).code).toBe(code);
  }
}

describe('MIGRATIONS table', () => {
  it('is forward-only: keys are dense starting at 0 targeting SCHEMA_VERSION-1', () => {
    const keys = Object.keys(MIGRATIONS).map(Number).sort((a, b) => a - b);
    keys.forEach((k, i) => expect(k).toBe(i));
    expect(keys[keys.length - 1]).toBe(SCHEMA_VERSION - 1);
  });
});
