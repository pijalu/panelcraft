// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceManager } from './workspace';
import { createFile } from './fs';
import { newStoredWorkspace, StoreError, type StoragePort, type VersionStoragePort } from './store/port';

function versionedStorage() {
  const current = newStoredWorkspace('current');
  createFile(current.tree, 'root.pcd', 'current');
  current.openTabs = ['root.pcd'];
  current.activePath = 'root.pcd';
  const historical = newStoredWorkspace('historical');
  createFile(historical.tree, 'root.pcd', 'historical');
  historical.openTabs = ['root.pcd'];
  historical.activePath = 'root.pcd';
  const versions: VersionStoragePort = {
    history: vi.fn().mockResolvedValue([]),
    show: vi.fn().mockResolvedValue(historical),
    restore: vi.fn().mockResolvedValue(historical),
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const port: StoragePort = {
    kind: 'server', label: 'Git repository', versions,
    load: vi.fn().mockResolvedValue(current), save,
    clear: vi.fn().mockResolvedValue(undefined), estimate: vi.fn().mockResolvedValue(null),
  };
  return { port, versions, save };
}

describe('WorkspaceManager Git versions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes pending edits, adopts a successful restore, and does not save it twice', async () => {
    const { port, versions, save } = versionedStorage();
    const manager = new WorkspaceManager({ storage: port, skipWelcome: true });
    await manager.init();
    manager.scheduleSave();
    await manager.restoreVersion('abc');
    expect(save).toHaveBeenCalledTimes(1);
    expect(versions.restore).toHaveBeenCalledWith('abc');
    expect(save.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(versions.restore).mock.invocationCallOrder[0]!);
    expect(manager.name).toBe('historical');
    expect(manager.text('root.pcd')).toBe('historical');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps the current workspace when restore fails', async () => {
    const { port, versions } = versionedStorage();
    vi.mocked(versions.restore).mockRejectedValue(new StoreError('conflict', 'changed'));
    const manager = new WorkspaceManager({ storage: port, skipWelcome: true });
    await manager.init();
    await expect(manager.restoreVersion('abc')).rejects.toMatchObject({ code: 'conflict' });
    expect(manager.name).toBe('current');
    expect(manager.text('root.pcd')).toBe('current');
  });

  it('does not invent history for non-Git or private storage', async () => {
    const manager = new WorkspaceManager({ skipWelcome: true });
    expect(manager.versions).toBeNull();
    await expect(manager.restoreVersion('abc')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
