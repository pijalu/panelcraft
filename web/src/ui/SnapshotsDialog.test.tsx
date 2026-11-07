// SPDX-License-Identifier: GPL-3.0-only
// SnapshotsDialog component tests (M6-WP6): save/restore/delete flows over
// promise-based props (store-independent). The initial load effect flips a
// busy flag until the first list() promise settles, so interaction tests
// drain it first (waitFor the empty/list state) to stay faithful to a real
// browser, where clicks on disabled buttons do nothing.
// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/preact';
import { SnapshotsDialog, type SnapshotsDialogProps } from './SnapshotsDialog';
import type { SnapshotRecord } from '../workspace/store/snapshots';

function rec(id: string, name: string): SnapshotRecord {
  return {
    id,
    name,
    savedAt: 1700000000000,
    ws: { schemaVersion: 1, irVersion: 1, savedAt: 1700000000000, name: 'w', tree: { kind: 'folder', name: 'root', children: [] }, openTabs: [], activePath: null },
  };
}

function Harness(props: Partial<SnapshotsDialogProps> = {}) {
  const saved: string[] = [];
  const restored: SnapshotRecord[] = [];
  const deleted: string[] = [];
  let closed = false;
  const store = new Map<string, SnapshotRecord>();
  const all: SnapshotsDialogProps = {
    snapshots: () => Promise.resolve([...store.values()]),
    onSave: (n) => {
      saved.push(n);
      store.set(`snap-${n}`, rec(`snap-${n}`, n));
      return Promise.resolve();
    },
    onRestore: (r) => restored.push(r),
    onDelete: (id) => {
      deleted.push(id);
      store.delete(id);
      return Promise.resolve();
    },
    onClose: () => (closed = true),
    ...props,
  };
  render(<SnapshotsDialog {...all} />);
  return { saved: () => saved, restored: () => restored, deleted: () => deleted, closed: () => closed };
}

/** Drain the mount effect (list() promise → busy=false) before interacting. */
async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByText('no snapshots yet')).toBeDefined());
}

describe('SnapshotsDialog', () => {
  afterEach(cleanup);

  it('shows the empty state when the store has no snapshots', async () => {
    Harness();
    await waitFor(() => expect(screen.getByText('no snapshots yet')).toBeDefined());
    expect(screen.getByTestId('snapshot-save')).toHaveProperty('disabled', true);
  });

  it('empty/whitespace name keeps save disabled', async () => {
    await (async () => {
      Harness();
      await ready();
    })();
    const input = screen.getByTestId('snapshot-name');
    fireEvent.input(input, { target: { value: '   ' } });
    expect(screen.getByTestId('snapshot-save')).toHaveProperty('disabled', true);
    fireEvent.input(input, { target: { value: 'before-refactor' } });
    expect(screen.getByTestId('snapshot-save')).toHaveProperty('disabled', false);
  });

  it('save adds to the list and clears the input', async () => {
    const h = Harness();
    await ready();
    fireEvent.input(screen.getByTestId('snapshot-name'), { target: { value: 'before-refactor' } });
    fireEvent.click(screen.getByTestId('snapshot-save'));
    await waitFor(() => expect(screen.getByText('before-refactor')).toBeDefined());
    expect(h.saved()).toEqual(['before-refactor']);
    expect((screen.getByTestId('snapshot-name') as HTMLInputElement).value).toBe('');
  });

  it('Enter in the name field saves', async () => {
    const h = Harness();
    await ready();
    const input = screen.getByTestId('snapshot-name');
    fireEvent.input(input, { target: { value: 'milestone-tag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.saved()).toEqual(['milestone-tag']));
  });

  it('restore passes the record and closes; delete removes from the list', async () => {
    const h = Harness();
    await ready();
    fireEvent.input(screen.getByTestId('snapshot-name'), { target: { value: 'snap-a' } });
    fireEvent.click(screen.getByTestId('snapshot-save'));
    await waitFor(() => expect(screen.getByTestId('snapshot-restore-snap-snap-a')).toBeDefined());
    fireEvent.click(screen.getByTestId('snapshot-restore-snap-snap-a'));
    expect(h.restored()[0]?.name).toBe('snap-a');
    expect(h.closed()).toBe(true);
    cleanup();
    const h2 = Harness();
    await ready();
    fireEvent.input(screen.getByTestId('snapshot-name'), { target: { value: 'snap-a' } });
    fireEvent.click(screen.getByTestId('snapshot-save'));
    await waitFor(() => expect(screen.getByTestId('snapshot-delete-snap-snap-a')).toBeDefined());
    fireEvent.click(screen.getByTestId('snapshot-delete-snap-snap-a'));
    await waitFor(() => expect(screen.getByText('no snapshots yet')).toBeDefined());
    expect(h2.deleted()).toEqual(['snap-snap-a']);
  });

  it('close button closes without side effects', async () => {
    const h = Harness();
    await ready();
    fireEvent.click(screen.getByTestId('snapshot-close'));
    expect(h.closed()).toBe(true);
    expect(h.saved()).toHaveLength(0);
  });
});
