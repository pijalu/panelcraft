// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Banners, type BannersProps } from './Banners';
import { ClearDataDialog } from './ClearDataDialog';
import { InfoHint } from './PanelChrome';
import { StorageActions, StorageLabel, storageExplanation } from './WorkspacePanels';

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

  it('names every backend distinctly, including origin-private browser files', () => {
    const { rerender } = render(<StorageLabel kind="server" label="Server filesystem" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Server storage: Server filesystem');

    rerender(<StorageLabel kind="directory" label="architecture" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Local folder: architecture');

    // Every backend now states where the files really live; none is silent.
    rerender(<StorageLabel kind="browser" label="Browser storage" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Browser storage (IndexedDB)');
    expect(screen.getByTestId('workspace-storage').getAttribute('data-storage-kind')).toBe('browser');

    rerender(<StorageLabel kind="opfs" label="Origin-private browser files" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Browser files (origin-private)');

    rerender(<StorageLabel kind="local" label="Browser Web Storage" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('Browser storage (Web Storage)');

    rerender(<StorageLabel kind="memory" label="In-memory" />);
    expect(screen.getByTestId('workspace-storage').textContent).toBe('In-memory workspace (not saved)');
  });

  it('offers native selection, reconnect and the way back without a first-run modal', () => {
    const onOpenDirectory = vi.fn();
    const onReconnect = vi.fn();
    const onUseBrowserStorage = vi.fn();
    const { rerender } = render(
      <StorageActions
        kind="opfs"
        nativeSupported
        reconnect={null}
        onOpenDirectory={onOpenDirectory}
        onReconnect={onReconnect}
        onUseBrowserStorage={onUseBrowserStorage}
      />,
    );
    // Browser files: picker only; nothing to reconnect or leave yet.
    fireEvent.click(screen.getByTestId('storage-open-directory'));
    expect(onOpenDirectory).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('storage-reconnect')).toBeNull();
    expect(screen.queryByTestId('storage-use-browser')).toBeNull();
    // The origin-private explanation never claims OS-visible files. It lives in the
    // panel header's info tooltip, so the Files body holds actions and files only.
    expect(storageExplanation('opfs')).toContain('not visible in your file manager');
    expect(screen.queryByTestId('storage-hint')).toBeNull();

    // A remembered folder whose permission lapsed: reconnect, still no auto prompt.
    rerender(
      <StorageActions
        kind="browser"
        nativeSupported
        reconnect="architecture"
        onOpenDirectory={onOpenDirectory}
        onReconnect={onReconnect}
        onUseBrowserStorage={onUseBrowserStorage}
      />,
    );
    expect(screen.getByTestId('storage-reconnect-hint').textContent).toContain('permission again');
    fireEvent.click(screen.getByTestId('storage-reconnect'));
    expect(onReconnect).toHaveBeenCalledTimes(1);

    // Native folder active: leaving is explicit, and the files stay on disk.
    rerender(
      <StorageActions
        kind="directory"
        nativeSupported
        reconnect={null}
        onOpenDirectory={onOpenDirectory}
        onReconnect={onReconnect}
        onUseBrowserStorage={onUseBrowserStorage}
      />,
    );
    fireEvent.click(screen.getByTestId('storage-use-browser'));
    expect(onUseBrowserStorage).toHaveBeenCalledTimes(1);
    expect(storageExplanation('directory')).toContain('stay on disk');
  });

  it('hides native selection where the browser has no directory picker', () => {
    render(
      <StorageActions
        kind="browser"
        nativeSupported={false}
        reconnect={null}
        onOpenDirectory={vi.fn()}
        onReconnect={vi.fn()}
        onUseBrowserStorage={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('storage-open-directory')).toBeNull();
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

describe('panel info trigger', () => {
  afterEach(cleanup);

  it('carries an accessible name, an accessible description and a visible tooltip', () => {
    // The explanation must survive without hovering: the trigger is a button, the
    // text is its description, and focus opens the same tooltip hover does.
    render(<InfoHint label="Files panel information" text="Browser files stay here." testId="info-test" />);
    const trigger = screen.getByTestId('info-test');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-label')).toBe('Files panel information');
    expect(trigger.getAttribute('title')).toBe('Browser files stay here.');
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Browser files stay here.');
    expect(screen.getByTestId('info-test-tooltip').textContent).toBe('Browser files stay here.');
  });
});
