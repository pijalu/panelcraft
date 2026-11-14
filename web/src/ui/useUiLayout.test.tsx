// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// UX-02: restored layout adoption must not swallow an early interaction, and
// structural docking operations must reach browser-local settings immediately.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/preact';
import type { WorkspaceManager } from '../workspace/workspace';
import { defaultLayout, openPanel, type UiLayout } from './uiLayout';
import { useUiLayout } from './useUiLayout';

function managerWith(layout: UiLayout) {
  const settings = { layout };
  const setSetting = vi.fn((key: 'layout', value: UiLayout) => {
    if (key === 'layout') settings.layout = value;
  });
  return { manager: { settings, setSetting } as unknown as WorkspaceManager, settings, setSetting };
}

describe('useUiLayout (UX-02)', () => {
  it('preserves and persists a first click made before stored settings arrive', () => {
    const stored = defaultLayout(1280);
    const { manager, setSetting } = managerWith(stored);
    let ready = false;
    const { result, rerender } = renderHook(() => useUiLayout(manager, ready, 0));

    act(() => result.current.openPanel('props'));
    expect(result.current.layout.panels.props).toBe('open');

    ready = true;
    rerender();
    expect(result.current.layout.panels.props).toBe('open');
    expect(setSetting).toHaveBeenCalledWith('layout', expect.objectContaining({
      panels: expect.objectContaining({ props: 'open' }),
    }));
  });

  it('ignores redundant resize events so they cannot collapse a settled workspace', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const stored = defaultLayout(1440);
    const { manager } = managerWith(stored);
    const { result } = renderHook(() => useUiLayout(manager, true, 0));
    act(() => {
      for (const panel of ['sidebar', 'flows', 'palette', 'code', 'props'] as const) {
        result.current.openPanel(panel);
        result.current.movePanel(panel, 'left');
      }
    });
    expect(Object.values(result.current.layout.panels)).toEqual(['open', 'open', 'open', 'open', 'open']);
    await act(async () => {});
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(Object.values(result.current.layout.panels)).toEqual(['open', 'open', 'open', 'open', 'open']);
  });

  it('ignores a transient resize blip so screenshots or metric overrides cannot collapse the workspace', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const stored = defaultLayout(1440);
    const { manager } = managerWith(stored);
    const { result } = renderHook(() => useUiLayout(manager, true, 0));
    act(() => {
      for (const panel of ['sidebar', 'flows', 'palette', 'code', 'props'] as const) {
        result.current.openPanel(panel);
      }
    });
    const opened = Object.values(result.current.layout.panels);
    // A fullPage screenshot resizes the viewport for one frame; the width is
    // implausible and must never rewrite the settled layout.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 120 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(Object.values(result.current.layout.panels)).toEqual(opened);
  });

  it('still recovers a genuinely narrow viewport once the resize settles', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const stored = defaultLayout(1440);
    const { manager } = managerWith(stored);
    const { result } = renderHook(() => useUiLayout(manager, true, 0));
    act(() => {
      for (const panel of ['sidebar', 'flows', 'palette', 'code', 'props'] as const) {
        result.current.openPanel(panel);
      }
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(Object.values(result.current.layout.panels)).not.toEqual(['open', 'open', 'open', 'open', 'open']);
  });

  it('restores an unchanged stored layout and persists dock/close operations at once', () => {
    const stored = openPanel(defaultLayout(1280), 'code');
    const { manager, setSetting } = managerWith(stored);
    const { result } = renderHook(() => useUiLayout(manager, true, 0));
    expect(result.current.layout).toEqual(stored);

    act(() => result.current.movePanel('code', 'bottom'));
    expect(setSetting).toHaveBeenLastCalledWith('layout', expect.objectContaining({
      docks: expect.objectContaining({ code: 'bottom' }),
    }));
    act(() => result.current.closePanel('code'));
    expect(setSetting).toHaveBeenLastCalledWith('layout', expect.objectContaining({
      panels: expect.objectContaining({ code: 'closed' }),
    }));
  });
});
