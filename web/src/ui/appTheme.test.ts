// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  appThemeSetting,
  normaliseAppTheme,
  readAppThemeCache,
  resolveAppTheme,
  writeAppThemeCache,
} from './appTheme';

describe('UX-05 application theme preference', () => {
  it('defaults to System and migrates missing, legacy or corrupt values safely', () => {
    expect(normaliseAppTheme(undefined)).toBe('system');
    expect(normaliseAppTheme(null)).toBe('system');
    expect(normaliseAppTheme('dark')).toBe('dark');
    expect(normaliseAppTheme({ version: 1, preference: 'light' })).toBe('light');
    expect(normaliseAppTheme({ version: 2, preference: 'dark' })).toBe('system');
    expect(normaliseAppTheme({ version: 1, preference: 'blue' })).toBe('system');
    expect(appThemeSetting('dark')).toEqual({ version: 1, preference: 'dark' });
  });

  it('resolves System from the OS and explicit modes independently', () => {
    expect(resolveAppTheme('system', false)).toBe('light');
    expect(resolveAppTheme('system', true)).toBe('dark');
    expect(resolveAppTheme('light', true)).toBe('light');
    expect(resolveAppTheme('dark', false)).toBe('dark');
  });

  it('uses a validated browser-local boot hint without throwing on storage failures', () => {
    writeAppThemeCache(window.localStorage, 'dark');
    expect(readAppThemeCache(window.localStorage)).toBe('dark');
    window.localStorage.setItem('panelcraft.app-theme', '{broken');
    expect(readAppThemeCache(window.localStorage)).toBe('system');
    const unavailable = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(readAppThemeCache(unavailable)).toBe('system');
    expect(() => writeAppThemeCache(unavailable, 'light')).not.toThrow();
  });
});
