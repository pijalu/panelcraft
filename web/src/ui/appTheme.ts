// SPDX-License-Identifier: GPL-3.0-only
// Application chrome theme preference. This is workspace UI state, never PDL
// document state; the document `theme` directive and CLI flag stay independent.

export type AppThemePreference = 'system' | 'light' | 'dark';
export type ResolvedAppTheme = Exclude<AppThemePreference, 'system'>;

export interface AppThemeSetting {
  version: 1;
  preference: AppThemePreference;
}

export const APP_THEME_CACHE_KEY = 'panelcraft.app-theme';

export interface ThemeCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function appThemeSetting(preference: AppThemePreference): AppThemeSetting {
  return { version: 1, preference };
}

export function normaliseAppTheme(value: unknown): AppThemePreference {
  // Accept the short-lived unversioned development representation on upgrade.
  if (value === 'system' || value === 'light' || value === 'dark') return value;
  if (typeof value !== 'object' || value === null) return 'system';
  const setting = value as { version?: unknown; preference?: unknown };
  if (setting.version !== 1) return 'system';
  return setting.preference === 'light' || setting.preference === 'dark' || setting.preference === 'system'
    ? setting.preference
    : 'system';
}

export function resolveAppTheme(
  preference: AppThemePreference,
  systemDark: boolean,
): ResolvedAppTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

/** The synchronous localStorage mirror is only a no-flash boot hint. */
export function readAppThemeCache(storage: ThemeCacheStorage): AppThemePreference {
  try {
    const raw = storage.getItem(APP_THEME_CACHE_KEY);
    return raw === null ? 'system' : normaliseAppTheme(JSON.parse(raw));
  } catch {
    return 'system';
  }
}

export function writeAppThemeCache(
  storage: ThemeCacheStorage,
  preference: AppThemePreference,
): void {
  try {
    storage.setItem(APP_THEME_CACHE_KEY, JSON.stringify(appThemeSetting(preference)));
  } catch {
    // Private/blocked storage must not prevent an in-memory theme change.
  }
}

export function applyAppTheme(
  root: { dataset: DOMStringMap },
  preference: AppThemePreference,
  systemDark: boolean,
): void {
  root.dataset.theme = resolveAppTheme(preference, systemDark);
  root.dataset.themePreference = preference;
}
