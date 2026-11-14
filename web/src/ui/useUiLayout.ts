// SPDX-License-Identifier: GPL-3.0-only
// UI layout hook (F-10): owns the panel layout, persists it with the workspace
// record and exposes the keyboard shortcuts. The pure model lives in
// uiLayout.ts; this file is the App-side glue only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import {
  closePanel as closePure,
  defaultLayout,
  movePanel as movePure,
  normaliseLayout,
  openPanel as openPure,
  recoverLayout,
  resetLayout as resetPure,
  setFloatingBounds as setFloatingPure,
  setPanelHeight as setHeightPure,
  setWidth as setWidthPure,
  togglePanel as togglePure,
  toggleSection as togglePure2,
  type DockId,
  type FloatingBounds,
  type PanelId,
  type UiLayout,
} from './uiLayout';

export interface UiLayoutHandle {
  layout: UiLayout;
  /** Write the pending layout now (drag end, unmount) instead of waiting. */
  flushLayout: () => void;
  togglePanel: (panel: PanelId) => void;
  closePanel: (panel: PanelId) => void;
  openPanel: (panel: PanelId) => void;
  movePanel: (panel: PanelId, dock: DockId) => void;
  setPanelWidth: (panel: PanelId, width: number) => void;
  setPanelHeight: (panel: PanelId, height: number) => void;
  setFloatingBounds: (panel: PanelId, bounds: FloatingBounds) => void;
  resetLayout: () => void;
  toggleSection: (section: string) => void;
}

/** True when the event comes from a text field (shortcuts must not fire). */
function inTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function useLayoutShortcuts(togglePanel: (panel: PanelId) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
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
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel]);
}

function useLayoutRecovery(
  update: (fn: (layout: UiLayout) => UiLayout) => void,
  saveTimer: { current: ReturnType<typeof setTimeout> | null },
): void {
  useEffect(() => {
    let width = window.innerWidth;
    let height = window.innerHeight;
    const recover = () => {
      if (window.innerWidth === width && window.innerHeight === height) return;
      width = window.innerWidth;
      height = window.innerHeight;
      update((current) => recoverLayout(current, width, height));
    };
    window.addEventListener('resize', recover);
    return () => {
      window.removeEventListener('resize', recover);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [saveTimer, update]);
}

function useLayoutPersistence(
  manager: WorkspaceManager,
  ready: boolean,
  layoutRef: { current: UiLayout },
  saveTimer: { current: ReturnType<typeof setTimeout> | null },
): { flushLayout: () => void; persist: (layout: UiLayout) => void } {
  const flushLayout = useCallback(() => {
    if (!ready) return;
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    manager.setSetting('layout', layoutRef.current);
  }, [layoutRef, manager, ready, saveTimer]);
  const persist = useCallback((next: UiLayout) => {
    if (!ready) return;
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;

      manager.setSetting('layout', next);
    }, 300);
  }, [manager, ready, saveTimer]);
  return { flushLayout, persist };
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
  const adoptedFrom = useRef<unknown>(undefined);
  const touched = useRef(false);
  const earlySave = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stored = manager.settings.layout;
  if (ready && stored !== adoptedFrom.current) {
    adoptedFrom.current = stored;

    if (!touched.current) {
      const next = recoverLayout(normaliseLayout(stored, viewport), viewport, window.innerHeight);
      layoutRef.current = next;
      setLayout(next);
    }
  }

  const { flushLayout, persist } = useLayoutPersistence(manager, ready, layoutRef, saveTimer);

  useEffect(() => {
    if (!ready || !earlySave.current) return;
    earlySave.current = false;
    manager.setSetting('layout', layoutRef.current);
  }, [manager, ready]);

  const update = useCallback(
    (fn: (l: UiLayout) => UiLayout, immediate = false) => {
      touched.current = true;
      if (!ready) earlySave.current = true;
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

  const focusPanel = useCallback((panel: PanelId, collapsed: boolean) => {
    requestAnimationFrame(() => {
      const selector = collapsed
        ? `[data-testid="expand-${panel}"]`
        : `[data-testid="panel-title-${panel}"]`;
      document.querySelector<HTMLButtonElement>(selector)?.focus();
    });
  }, []);
  const togglePanel = useCallback(
    (panel: PanelId) => {
      const collapsed = layoutRef.current.panels[panel] === 'open';
      update((l) => togglePure(l, panel), true);
      focusPanel(panel, collapsed);
    },
    [focusPanel, update],
  );
  const closePanel = useCallback(
    (panel: PanelId) => {
      update((l) => closePure(l, panel), true);
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="view-menu"]')?.focus());
    },
    [update],
  );
  const openPanel = useCallback(
    (panel: PanelId) => {
      update((l) => openPure(l, panel), true);
      focusPanel(panel, false);
    },
    [focusPanel, update],
  );
  const movePanel = useCallback(
    (panel: PanelId, dock: DockId) => {
      update((l) => movePure(l, panel, dock), true);
      focusPanel(panel, false);
    },
    [focusPanel, update],
  );
  const setPanelWidth = useCallback(
    (panel: PanelId, width: number) => update((l) => setWidthPure(l, panel, width)),
    [update],
  );
  const setPanelHeight = useCallback(
    (panel: PanelId, height: number) => update((l) => setHeightPure(l, panel, height)),
    [update],
  );
  const setFloatingBounds = useCallback(
    (panel: PanelId, bounds: FloatingBounds) => update(
      (l) => setFloatingPure(l, panel, bounds, window.innerWidth, window.innerHeight),
      true,
    ),
    [update],
  );
  const resetLayout = useCallback(() => {
    update((l) => resetPure(l, window.innerWidth), true);
    focusPanel('palette', false);
  }, [focusPanel, update]);
  const toggleSection = useCallback(
    (section: string) => update((l) => togglePure2(l, section), true),
    [update],
  );

  useLayoutShortcuts(togglePanel);
  useLayoutRecovery(update, saveTimer);

  /* version bump: keep the local layout (it is authoritative in-session) */
  useMemo(() => version, [version]);

  return {
    layout,
    flushLayout,
    togglePanel,
    closePanel,
    openPanel,
    movePanel,
    setPanelWidth,
    setPanelHeight,
    setFloatingBounds,
    resetLayout,
    toggleSection,
  };
}
