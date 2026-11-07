// SPDX-License-Identifier: GPL-3.0-only
// M6 chrome wiring (M6-WP5/WP6): Ctrl+P quick search, search jump-to,
// snapshots toolbar entry. Lives in its own file because fake-indexeddb/auto
// swaps the global indexedDB — the workspace autosave store shares it, and
// per-test IDBFactory resets keep both stores isolated.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { IDBFactory } from 'fake-indexeddb';
import { App } from './App';

/** Mount App and settle the async init chain (storage → init → ready). */
async function mountReady() {
  const { container } = render(<App />);
  await act(async () => {}); // flush manager.init() → welcome file ready
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0)); // storage fallback macrotask → setReady
  });
  const svg = container.querySelector('svg') as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
  return { container, svg };
}

describe('M6 chrome: quick search + snapshots (M6-WP5/6)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    globalThis.indexedDB = new IDBFactory(); // fresh stores per test
  });

  afterEach(cleanup);

  it('Ctrl+P opens quick search; Escape closes (FR-W6)', async () => {
    await mountReady();
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    expect(screen.getByTestId('search-overlay')).not.toBeNull();
    fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Escape' });
    expect(screen.queryByTestId('search-overlay')).toBeNull();
  });

  it('search jump selects the object on the canvas (FR-W6)', async () => {
    const { svg } = await mountReady();
    fireEvent.click(screen.getByTestId('palette-system'));
    // canvas → file text is debounced (~150 ms); wait it out so the search
    // index sees the object
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    const input = screen.getByTestId('search-input');
    fireEvent.input(input, { target: { value: 'system' } });
    const row = screen.getByTestId('search-row-0');
    expect(row.textContent).toContain('System 1');
    fireEvent.click(row);
    await act(async () => {});
    expect(screen.queryByTestId('search-overlay')).toBeNull();
    expect((screen.getByTestId('prop-name') as HTMLInputElement).value).toBe('System 1');
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(1);
  });

  it('Snapshots toolbar button opens the dialog; close dismisses (FR-W7)', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tb-snapshots'));
    await act(async () => {});
    expect(screen.getByTestId('snapshots-overlay')).not.toBeNull();
    fireEvent.click(screen.getByTestId('snapshot-close'));
    expect(screen.queryByTestId('snapshots-overlay')).toBeNull();
  });
});
