// SPDX-License-Identifier: GPL-3.0-only
// Explicit setup for specs written against the pre-UX-02 all-panels-open shell.
import { expect, type Page } from '@playwright/test';

export type WorkspacePanel = 'sidebar' | 'flows' | 'palette' | 'code' | 'props';

/** UX08-WP01: the header now exposes one Application menu. */
/** Open a menu only when it is closed; Playwright may race a pending toggle. */
async function revealMenuItem(page: Page, triggerId: string, testId: string): Promise<void> {
  const trigger = page.getByTestId(triggerId);
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const target = page.getByTestId(testId);
  // A grouped command is not in the DOM until its named submenu opens. Walk the
  // root submenu rows rather than duplicating the group membership in tests.
  if (await target.count() === 0) {
    const menuId = await trigger.getAttribute('aria-controls');
    if (menuId !== null) {
      const rows = page.locator(`#${menuId} [aria-haspopup="menu"]`);
      const count = await rows.count();
      for (let index = 0; index < count; index++) {
        const row = rows.nth(index);
        if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
        if (await target.count() > 0) break;
      }
    }
  }
  await target.click();
}

/** Open a named application-menu group by its stable test id. */
export async function openAppGroup(page: Page, groupTestId: string): Promise<void> {
  const trigger = page.getByTestId('app-menu');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const row = page.getByTestId(groupTestId);
  await expect(row).toBeVisible();
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
}

export async function chooseAppMenu(page: Page, testId: string): Promise<void> {
  await revealMenuItem(page, 'app-menu', testId);
}

/** UX08-WP01: panel actions live in the shared menu primitive. */
export async function choosePanelMenu(page: Page, panel: WorkspacePanel, testId: string): Promise<void> {
  await revealMenuItem(page, `panel-menu-${panel}`, testId);
}

/** UX08-WP01: current-file exports live in the Export current submenu. */
export async function chooseExport(page: Page, kind: 'pcd' | 'mmd' | 'svg' | 'png'): Promise<void> {
  await revealMenuItem(page, 'app-menu', 'menu-export-current');
  await page.getByTestId(`tb-export-${kind}`).click();
}

/** UX08-WP01: theme is a radio group inside the Application menu. */
export async function setAppTheme(page: Page, preference: 'system' | 'light' | 'dark'): Promise<void> {
  await chooseAppMenu(page, `app-theme-${preference}`);
}

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
      await chooseAppMenu(page, `view-panel-${panel}`);
    }
    await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible();
  }
}

/** Flow scenarios need the editor, not the now-independent file browser. */
export async function openFlowSteps(page: Page): Promise<void> {
  if (await page.locator('[data-panel="sidebar"]').count()) {
    await choosePanelMenu(page, 'sidebar', 'close-sidebar');
  }
  await openWorkspacePanels(page, ['flows']);
  await expect(page.getByTestId('flow-pane')).toBeVisible();
}
