// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only

import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

async function mountReady(): Promise<void> {
  render(<App />);
  await act(async () => {});
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  for (const panel of ['sidebar', 'code', 'props']) {
    fireEvent.click(screen.getByTestId(`expand-${panel}`));
  }
}

function codeView(): EditorView {
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
  if (!view) throw new Error('no EditorView in DOM');
  return view;
}

describe('UX-03 independent workspace browser panels', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(cleanup);

  it('keeps the dirty active tab and code buffer when Files closes and reopens', async () => {
    await mountReady();
    const view = codeView();
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'pcd 1.0\nsystem' } });
    });
    fireEvent.click(screen.getByTestId('close-sidebar'));
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(screen.queryByTestId('file-tree')).toBeNull();
    expect(screen.getByTestId('tab-untitled.pcd')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('view-menu'));
    expect(view.state.doc.toString()).toBe('pcd 1.0\nsystem');
    expect(screen.queryByTestId('diverged-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('view-menu'));
    fireEvent.click(screen.getByTestId('view-panel-sidebar'));
    expect(screen.getByTestId('file-tree')).not.toBeNull();
    expect(view.state.doc.toString()).toBe('pcd 1.0\nsystem');
  });

  it('opens Flow Steps independently and preserves its selection across remounts', async () => {
    await mountReady();
    const view = codeView();
    act(() => {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: 'pcd 1.0\nsystem web "Web"\nflow "Main" as main {\n  intro "Start"\n}',
        },
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.queryByTestId('flow-pane')).toBeNull();
    fireEvent.click(screen.getByTestId('view-menu'));
    fireEvent.click(screen.getByTestId('view-panel-flows'));
    fireEvent.click(screen.getByTestId('flow-row-main'));
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
    expect(screen.getByTestId('file-tree')).not.toBeNull();

    fireEvent.click(screen.getByTestId('close-sidebar'));
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
    fireEvent.click(screen.getByTestId('dock-flows-right'));
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
    fireEvent.click(screen.getByTestId('close-flows'));
    fireEvent.click(screen.getByTestId('view-menu'));
    fireEvent.click(screen.getByTestId('view-panel-flows'));
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
  });
});
