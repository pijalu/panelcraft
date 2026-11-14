// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceManager } from '../workspace/workspace';
import { appThemeSetting } from './appTheme';
import { useAppTheme } from './useAppTheme';

function managerWith(appTheme?: unknown) {
  const settings: { appTheme?: unknown } = { appTheme };
  const setSetting = vi.fn((key: 'appTheme', value: unknown) => {
    if (key === 'appTheme') settings.appTheme = value;
  });
  return { manager: { settings, setSetting } as unknown as WorkspaceManager, settings, setSetting };
}

function osScheme(initial: boolean) {
  let dark = initial;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  };
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia;
  return {
    set(value: boolean) {
      dark = value;
      query.matches = value;
      for (const listener of listeners) listener({ matches: value });
    },
  };
}

describe('useAppTheme (UX-05)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
  });

  it('restores the versioned workspace preference and applies its resolved root theme', () => {
    osScheme(false);
    const { manager } = managerWith(appThemeSetting('dark'));
    const { result } = renderHook(() => useAppTheme(manager, true, 0));
    expect(result.current.preference).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePreference).toBe('dark');
    expect(readLocalHint()).toBe('dark');
  });

  it('follows live OS changes only in System mode', () => {
    const os = osScheme(false);
    const { manager, setSetting } = managerWith(appThemeSetting('system'));
    const { result } = renderHook(() => useAppTheme(manager, true, 0));
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => os.set(true));
    expect(document.documentElement.dataset.theme).toBe('dark');

    act(() => result.current.setPreference('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(setSetting).toHaveBeenLastCalledWith('appTheme', appThemeSetting('light'));
    act(() => os.set(false));
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => os.set(true));
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => result.current.setPreference('system'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('preserves a pre-init choice and uses the boot hint before storage arrives', () => {
    osScheme(true);
    writeBootHint('light');
    const { manager, setSetting } = managerWith(appThemeSetting('dark'));
    let ready = false;
    const { result, rerender } = renderHook(() => useAppTheme(manager, ready, 0));
    expect(result.current.preference).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    act(() => result.current.setPreference('system'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    ready = true;
    rerender();
    expect(result.current.preference).toBe('system');
    expect(setSetting).toHaveBeenCalledWith('appTheme', appThemeSetting('system'));
  });
});

function writeBootHint(preference: 'light' | 'dark'): void {
  window.localStorage.setItem('panelcraft.app-theme', JSON.stringify({ version: 1, preference }));
}

function readLocalHint(): string {
  return JSON.parse(window.localStorage.getItem('panelcraft.app-theme') ?? '{}').preference;
}
