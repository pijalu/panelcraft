// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01 test helper: reveal a grouped menu action before selecting it.
import { fireEvent, screen } from '@testing-library/preact';

export function openAppMenu(): void {
  fireEvent.click(screen.getByTestId('app-menu'));
}

export function chooseAppMenu(testId: string): void {
  openAppMenu();
  fireEvent.click(screen.getByTestId(testId));
}

export function choosePanelAction(panel: string, testId: string): void {
  fireEvent.click(screen.getByTestId(`panel-menu-${panel}`));
  fireEvent.click(screen.getByTestId(testId));
}
