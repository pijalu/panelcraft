// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01 test helper: reveal a grouped menu action before selecting it.
import { fireEvent, screen } from '@testing-library/preact';

export function openAppMenu(): void {
  fireEvent.click(screen.getByTestId('app-menu'));
}

export function chooseAppMenu(testId: string): void {
  const trigger = screen.getByTestId('app-menu');
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  let target = screen.queryByTestId(testId);
  // A grouped command is not in the DOM until its submenu opens; discover the
  // group from the rendered menu instead of duplicating the membership matrix.
  if (target === null) {
    const rows = Array.from(
      document.querySelectorAll('#app-menu button[aria-haspopup="menu"]'),
    );
    for (const row of rows) {
      fireEvent.click(row);
      target = screen.queryByTestId(testId);
      if (target !== null) break;
    }
  }
  if (target === null) throw new Error(`menu entry ${testId} not found`);
  fireEvent.click(target);
}

export function choosePanelAction(panel: string, testId: string): void {
  fireEvent.click(screen.getByTestId(`panel-menu-${panel}`));
  fireEvent.click(screen.getByTestId(testId));
}
