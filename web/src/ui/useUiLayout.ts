// SPDX-License-Identifier: GPL-3.0-only
// UI layout hook (F-10): owns the panel layout, persists it with the workspace
// record and exposes the keyboard shortcuts. The pure model lives in
// uiLayout.ts; this file is the App-side glue only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import {
  defaultLayout,
  normaliseLayout,
  setWidth as setWidthPure,
  togglePanel as togglePure,
  toggleSection as togglePure2,
  type PanelId,
  type UiLayout,
} from './uiLayout';

export interface UiLayoutHandle {
  layout: UiLayout;
  /** Write the pending layout now (drag end, unmount) instead of waiting. */
  flushLayout: () => void;
  togglePanel: (panel: PanelId) => void;
  setPanelWidth: (panel: PanelId, width: number) => void;
  toggleSection: (section: string) => void;
}

/** True when the event comes from a text field (shortcuts must not fire). */
function inTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * @param manager  workspace manager (settings persistence)
 * @param ready    workspace initialized (stored layout available)
 * @param version  manager version bump (adopt restored settings)
 */
export function useUiLayout(manager: WorkspaceManager, ready: boolean, version: number): UiLayoutHandle {
  const viewport = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth;
  const [layout, setLayout] = useState<UiLayout>(() => defaultLayout(viewport));
  const layoutRef = useRef<UiLayout>(layout);
  /** Layout snapshot the local state was derived from (render-time adoption). */
  const adoptedFrom = useRef<unknown>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Adopt the stored layout *during render* the first time it appears (the
   * workspace record resolves after mount). Doing this in an effect painted the
   * default layout first and then overwrote whatever the user had just clicked
   * — a real "my first click did nothing" bug (F-32).
   */
  const stored = manager.settings.layout;
  if (ready && stored !== adoptedFrom.current) {
    adoptedFrom.current = stored;
    const next = normaliseLayout(stored, viewport);
    layoutRef.current = next;
    setLayout(next);
  }

  /* persist (debounced 300 ms — resizing must not hammer IDB) */

  const flushLayout = useCallback(() => {
    if (!ready) return;
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    manager.setSetting('layout', layoutRef.current);
  }, [manager, ready]);

  const persist = useCallback(
    (next: UiLayout) => {
      if (!ready) return;
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        manager.setSetting('layout', next);
      }, 300);
    },
    [manager, ready],
  );

  const update = useCallback(
    (fn: (l: UiLayout) => UiLayout, immediate = false) => {
      const next = fn(layoutRef.current);
      // keep the ref in step so a flush right after (drag end, toggle) writes
      // the value the user just produced, not the previous render's
      layoutRef.current = next;
      setLayout(next);
      if (immediate) {
        if (saveTimer.current !== null) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        if (ready) manager.setSetting('layout', next);
        return;
      }
      persist(next);
    },
    [manager, persist, ready],
  );

  const togglePanel = useCallback(
    (panel: PanelId) => {
      update((l) => togglePure(l, panel), true);
      // F-10: focus must follow the panel — otherwise it lands inside the
      // unmounted content (or on its replacement) and the shortcuts stop firing
      requestAnimationFrame(() => {
        const rail = document.querySelector<HTMLButtonElement>(`[data-testid="expand-${panel}"]`);
        if (rail) rail.focus();
      });
    },
    [update],
  );
  const setPanelWidth = useCallback(
    (panel: PanelId, width: number) => update((l) => setWidthPure(l, panel, width)),
    [update],
  );
  const toggleSection = useCallback(
    (section: string) => update((l) => togglePure2(l, section), true),
    [update],
  );

  /* keyboard shortcuts: mod+B sidebar, mod+J code, mod+alt+P properties */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // Cmd/Ctrl+Alt+P cannot be typed, so it fires even from a text field —
      // otherwise the shortcut dies the moment focus lands inside a panel.
      const panelShortcut = e.altKey && key === 'p';
      if (!panelShortcut && inTextEntry(e.target)) return;
      if (!e.altKey && key === 'b') {
        e.preventDefault();
        togglePanel('sidebar');
        return;
      }
      if (!e.altKey && key === 'j') {
        e.preventDefault();
        togglePanel('code');
        return;
      }
      if (panelShortcut) {
        e.preventDefault();
        togglePanel('props');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [togglePanel]);

  /* version bump: keep the local layout (it is authoritative in-session) */
  useMemo(() => version, [version]);

  return { layout, flushLayout, togglePanel, setPanelWidth, toggleSection };
}
