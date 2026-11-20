// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import { createFile } from '../workspace/fs';
import { newStoredWorkspace, StoreError, type VersionStoragePort } from '../workspace/store/port';

afterEach(cleanup);

function versionStore(): VersionStoragePort {
  const workspace = newStoredWorkspace('historical');
  createFile(workspace.tree, 'root.pcd', 'first');
  createFile(workspace.tree, 'docs/child.pcd', 'child');
  return {
    history: vi.fn().mockResolvedValue([
      { id: 'new', message: 'PanelCraft workspace', savedAt: 200 },
      { id: 'old', message: 'PanelCraft workspace', savedAt: 100 },
    ]),
    show: vi.fn().mockResolvedValue(workspace),
    restore: vi.fn(),
  };
}

describe('VersionHistoryDialog', () => {
  it('previews a selected commit and requires confirmation before restore', async () => {
    const store = versionStore();
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<VersionHistoryDialog store={store} onRestore={onRestore} onClose={onClose} />);
    await screen.findByTestId('version-row-old');
    expect(screen.queryByTestId('version-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('version-select-old'));
    await screen.findByText('docs/child.pcd');
    fireEvent.click(screen.getByTestId('version-restore'));
    expect(screen.getByTestId('version-confirm').textContent).toContain('new commit');
    fireEvent.click(screen.getByTestId('version-confirm-restore'));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('old'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows loading failures without promising a restore', async () => {
    const store = versionStore();
    vi.mocked(store.history).mockRejectedValue(new StoreError('unavailable', 'history unavailable'));
    render(<VersionHistoryDialog store={store} onRestore={vi.fn()} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('history unavailable');
    expect(screen.queryByTestId('version-restore')).toBeNull();
  });

  it('keeps the dialog open and reports a failed restore', async () => {
    const store = versionStore();
    const onRestore = vi.fn().mockRejectedValue(new StoreError('conflict', 'changed externally'));
    const onClose = vi.fn();
    render(<VersionHistoryDialog store={store} onRestore={onRestore} onClose={onClose} />);
    await screen.findByTestId('version-row-old');
    fireEvent.click(screen.getByTestId('version-select-old'));
    await screen.findByText('root.pcd');
    fireEvent.click(screen.getByTestId('version-restore'));
    fireEvent.click(screen.getByTestId('version-confirm-restore'));
    expect((await screen.findByRole('alert')).textContent).toContain('changed externally');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismisses with Escape and exposes an empty state', async () => {
    const store = versionStore();
    vi.mocked(store.history).mockResolvedValue([]);
    const onClose = vi.fn();
    render(<VersionHistoryDialog store={store} onRestore={vi.fn()} onClose={onClose} />);
    await screen.findByText('No Git commits yet.');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
