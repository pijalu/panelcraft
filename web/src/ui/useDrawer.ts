// SPDX-License-Identifier: GPL-3.0-only
// WP02: narrow viewports show one side panel as an overlay drawer. The hook owns
// the media query, the Escape dismissal and the "which panel" decision so AppBody
// stays a layout component.
//
// The Escape listener is bound once and reads the current drawer from a ref: rebinding
// it on every layout change raced with Preact's effect cleanup and left some renders
// without a listener (the drawer stayed open on Escape).
import { useEffect, useRef } from 'preact/hooks';
import { drawerPanel, type PanelId, type UiLayout } from './uiLayout';
import { useMediaQuery } from './useMediaQuery';

export interface DrawerHandle {
  drawer: PanelId | null;
  dismiss: () => void;
}

export function useDrawer(ui: { layout: UiLayout; closePanel: (panel: PanelId) => void }): DrawerHandle {
  const narrow = useMediaQuery('(max-width: 719px)');
  const drawer = narrow ? drawerPanel(ui.layout) : null;
  const close = ui.closePanel;
  const latest = useRef({ drawer, close });
  latest.current = { drawer, close };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const current = latest.current;
      if (event.key !== 'Escape' || current.drawer === null) return;
      event.preventDefault();
      current.close(current.drawer);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return {
    drawer,
    dismiss: () => {
      if (drawer !== null) close(drawer);
    },
  };
}
