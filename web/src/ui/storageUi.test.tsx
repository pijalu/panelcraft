// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Banners, type BannersProps } from './Banners';
import { ClearDataDialog } from './ClearDataDialog';
import { StorageLabel } from './WorkspacePanels';

function bannerProps(overrides: Partial<BannersProps> = {}): BannersProps {
  return {
    openError: null,
    storageError: null,
    onDismissStorageError: vi.fn(),
    quotaDegraded: false,
    ephemeral: false,
    reminder: false,
    onDismissError: vi.fn(),
    onDismissReminder: vi.fn(),
    ...overrides,
  };
}

describe('storage-aware workspace chrome', () => {
  afterEach(cleanup);

  it('names server and directory storage without adding noise to browser storage', () => {
    const { rerender } = render(<StorageLabel kind="server" label="Server filesystem" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Server storage: Server filesystem');

    rerender(<StorageLabel kind="directory" label="architecture" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Local folder: architecture');

    rerender(<StorageLabel kind="browser" label="Browser storage" />);
    expect(screen.queryByTestId('workspace-storage')).toBeNull();
  });

  it('describes the real files affected by server and directory clear actions', () => {
    const { rerender } = render(
      <ClearDataDialog storageKind="server" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('clear-dialog').textContent).toContain('every workspace file on the server');
    expect(screen.getByTestId('clear-dialog').textContent).not.toContain('browser storage');

    rerender(<ClearDataDialog storageKind="directory" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('clear-dialog').textContent).toContain('selected local folder');
    expect(screen.getByTestId('clear-dialog').textContent).not.toContain('browser storage');
  });

  it('reports and dismisses save failures separately from workspace-open failures', () => {
    const onDismissStorageError = vi.fn();
    render(<Banners {...bannerProps({
      openError: 'corrupt record',
      storageError: 'conflict: workspace changed',
      onDismissStorageError,
    })} />);

    expect(screen.getByTestId('banner-open-error').textContent).toContain('corrupt record');
    const storage = screen.getByTestId('banner-storage-error');
    expect(storage.textContent).toContain('changed outside PanelCraft');
    expect(storage.textContent).toContain('Download a copy of your edits');
    expect(storage.textContent).not.toContain('conflict: workspace changed');
    fireEvent.click(storage.querySelector('button') as HTMLButtonElement);
    expect(onDismissStorageError).toHaveBeenCalledTimes(1);
  });
});
