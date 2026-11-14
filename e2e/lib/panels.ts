// SPDX-License-Identifier: GPL-3.0-only
// Explicit setup for specs written against the pre-UX-02 all-panels-open shell.
import { expect, type Page } from '@playwright/test';

export type WorkspacePanel = 'sidebar' | 'flows' | 'palette' | 'code' | 'props';

/** Open only the panels a legacy scenario uses; fresh-layout specs opt out. */
export async function openWorkspacePanels(
  page: Page,
  panels: readonly WorkspacePanel[] = ['sidebar', 'code', 'props'],
): Promise<void> {
  for (const panel of panels) {
    if (await page.locator(`[data-panel="${panel}"]`).count()) continue;
    const expand = page.getByTestId(`expand-${panel}`);
    if (await expand.count()) {
      await expand.click();
    } else {
      await page.getByTestId('view-menu').click();
      await page.getByTestId(`view-panel-${panel}`).click();
    }
    await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
  }
}

/** Flow scenarios need the editor, not the now-independent file browser. */
export async function openFlowSteps(page: Page): Promise<void> {
  if (await page.locator('[data-panel="sidebar"]').count()) {
    await page.getByTestId('panel-menu-sidebar').click();
    await page.getByTestId('close-sidebar').click();
  }
  await openWorkspacePanels(page, ['flows']);
  await expect(page.getByTestId('flow-pane')).toBeVisible();
}
