// SPDX-License-Identifier: GPL-3.0-only
// Restores and persists the application-only theme preference. Workspace
// settings are authoritative; the localStorage mirror avoids a reload flash.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import {
  appThemeSetting,
  applyAppTheme,
  normaliseAppTheme,
  readAppThemeCache,
  writeAppThemeCache,
  type AppThemePreference,
} from './appTheme';

export interface AppThemeHandle {
  preference: AppThemePreference;
  setPreference: (preference: AppThemePreference) => void;
}

export function useAppTheme(
  manager: WorkspaceManager,
  ready: boolean,
  _version: number,
): AppThemeHandle {
  const [preference, setPreferenceState] = useState<AppThemePreference>(() => {
    try {
      return readAppThemeCache(window.localStorage);
    } catch {
      return 'system';
    }
  });
  const preferenceRef = useRef(preference);
  const adoptedFrom = useRef<unknown>(undefined);
  const touched = useRef(false);
  const earlySave = useRef(false);

  const stored = manager.settings.appTheme;
  if (ready && stored !== adoptedFrom.current) {
    adoptedFrom.current = stored;
    if (!touched.current) {
      const next = normaliseAppTheme(stored);
      preferenceRef.current = next;
      setPreferenceState(next);
      try {
        writeAppThemeCache(window.localStorage, next);
      } catch {
        // Accessing window.localStorage itself may be denied.
      }
    }
  }

  useEffect(() => {
    const query = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const apply = () => applyAppTheme(document.documentElement, preference, query?.matches ?? false);
    apply();
    query?.addEventListener('change', apply);
    return () => query?.removeEventListener('change', apply);
  }, [preference]);

  useEffect(() => {
    if (!ready || !earlySave.current) return;
    earlySave.current = false;
    manager.setSetting('appTheme', appThemeSetting(preferenceRef.current));
  }, [manager, ready]);

  const setPreference = useCallback((next: AppThemePreference) => {
    touched.current = true;
    if (!ready) earlySave.current = true;
    preferenceRef.current = next;
    setPreferenceState(next);
    try {
      writeAppThemeCache(window.localStorage, next);
    } catch {
      // The workspace hook remains usable when localStorage is unavailable.
    }
    if (ready) manager.setSetting('appTheme', appThemeSetting(next));
  }, [manager, ready]);

  return { preference, setPreference };
}
