// SPDX-License-Identifier: GPL-3.0-only
// UX-03 browser acceptance: independent Files/Flow Steps panels, non-destructive
// close/reopen, keyboard focus, quick search, persistence, a11y and both themes.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu, choosePanelMenu, openWorkspacePanels } from './lib/panels';

const FLOW_DOC = `pcd 1.0
person ada "Ada"
system web "Web"
ada -> web
flow "Checkout" as main {
  intro "Start"
  ada -> web : "request"
  conclusion "Done"
}
`;

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
}

async function show(page: Page, panel: 'sidebar' | 'flows' | 'code'): Promise<void> {
  await chooseAppMenu(page, `view-panel-${panel}`);
  await expect(page.getByTestId(`panel-title-${panel}`)).toBeFocused();
}

async function seedFlow(page: Page): Promise<void> {
  await show(page, 'code');
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(FLOW_DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`UX-03: independent workspace browser filmstrip (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await expect(page.getByTestId('rail-sidebar')).toBeVisible();
    await expect(page.locator('[data-panel="flows"]')).toHaveCount(0);
    await expect(page.getByTestId('side-tab-files')).toHaveCount(0);
    await expect(page.getByTestId('side-tab-flows')).toHaveCount(0);
    await capture(page, `ux03-fresh-${colorScheme}`);

    await show(page, 'sidebar');
    await seedFlow(page);
    await show(page, 'flows');
    await expect(page.getByTestId('file-tree')).toBeVisible();
    await expect(page.getByTestId('flow-pane')).toBeVisible();
    await page.getByTestId('flow-row-main').click();
    await expect(page.getByTestId('step-0')).toBeVisible();
    await capture(page, `ux03-independent-${colorScheme}`);
    await test.info().attach(`ux03-independent-${colorScheme}-accessibility`, {
      body: await page.getByTestId('app-shell').ariaSnapshot(),
      contentType: 'text/plain',
    });
    await axe(page);

    await choosePanelMenu(page, 'flows', 'dock-flows-right');
    await expect(page.locator('[data-panel="flows"]')).toHaveAttribute('data-dock', 'right');
    await expect(page.getByTestId('step-0')).toBeVisible();
    await expect(page.getByTestId('file-tree')).toBeVisible();
    await capture(page, `ux03-docked-${colorScheme}`);

    await choosePanelMenu(page, 'sidebar', 'close-sidebar');
    await expect(page.getByTestId('app-menu')).toBeFocused();
    await expect(page.getByTestId('file-tree')).toHaveCount(0);
    await expect(page.getByTestId('flow-pane')).toBeVisible();
    await expect(page.getByTestId('tab-untitled.pcd')).toHaveAttribute('data-active', 'true');
    await capture(page, `ux03-files-closed-${colorScheme}`);
    await test.info().attach(`ux03-files-closed-${colorScheme}-accessibility`, {
      body: await page.getByTestId('app-shell').ariaSnapshot(),
      contentType: 'text/plain',
    });
    await axe(page);

    await page.keyboard.press('ControlOrMeta+p');
    await expect(page.getByTestId('search-overlay')).toBeVisible();
    await page.getByTestId('search-input').fill('untitled');
    await expect(page.getByTestId('search-results').locator('button')).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('search-overlay')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect(page.getByTestId('file-tree')).toHaveCount(0);
    await expect(page.getByTestId('flow-pane')).toBeVisible();
    await expect(page.locator('[data-panel="flows"]')).toHaveAttribute('data-dock', 'right');
    await capture(page, `ux03-restored-${colorScheme}`);
    await show(page, 'sidebar');
    await expect(page.getByTestId('tree-row-untitled.pcd')).toBeVisible();
    await capture(page, `ux03-reopened-${colorScheme}`);

    await page.getByTestId('tree-new-folder').click();
    await page.getByTestId('tree-create-input').fill('diagrams');
    await page.getByTestId('tree-create-input').press('Enter');
    await expect(page.getByTestId('tree-row-diagrams')).toBeVisible();
    await capture(page, `ux03-organizing-${colorScheme}`);
    await choosePanelMenu(page, 'sidebar', 'dock-sidebar-float');
    await expect(page.locator('[data-panel="sidebar"]')).toHaveAttribute('data-dock', 'float');
    await capture(page, `ux03-floating-${colorScheme}`);

    const editor = page.locator('.cm-content');
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+a');
    await page.keyboard.insertText('pcd 1.0\nsystem');
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'error');
    await capture(page, `ux03-dirty-${colorScheme}`);
  });
}

test('UX-03: keyboard close preserves dirty tabs, code, search and toolbar commands', async ({ page }) => {
  await ready(page);
  await openWorkspacePanels(page, ['sidebar', 'code']);
  await page.getByTestId('tree-new-file').click();
  await page.getByTestId('tree-create-input').fill('arch.pcd');
  await page.getByTestId('tree-create-input').press('Enter');
  await expect(page.getByTestId('tab-arch.pcd')).toHaveAttribute('data-active', 'true');

  const editor = page.locator('.cm-content');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  const dirty = 'pcd 1.0\nsystem';
  await page.keyboard.insertText(dirty);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'error');

  await page.getByTestId('panel-menu-sidebar').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('close-sidebar').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('app-menu')).toBeFocused();
  await expect(page.getByTestId('file-tree')).toHaveCount(0);
  await expect(page.getByTestId('tab-arch.pcd')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  expect(await page.locator('.cm-content').innerText()).toBe(dirty);
  await expect(page.getByTestId('diverged-dialog')).toHaveCount(0);
  await page.getByTestId('app-menu').click();
  await page.getByTestId('menu-export-current').click();
  await expect(page.getByTestId('tb-export-pcd')).toBeEnabled();
  const pendingDownload = page.waitForEvent('download');
  await page.getByTestId('tb-export-pcd').click();
  expect((await pendingDownload).suggestedFilename()).toBe('arch.pcd');
  await chooseAppMenu(page, 'tb-snapshots');
  await expect(page.getByTestId('snapshots-overlay')).toBeVisible();
  await page.getByTestId('snapshot-close').click();
  await expect(page.getByTestId('snapshots-overlay')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+p');
  await expect(page.getByTestId('search-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-overlay')).toHaveCount(0);
  await page.getByTestId('app-menu').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('menu-group-layout').focus();
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('view-panel-sidebar').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('file-tree')).toBeVisible();
  expect(await page.locator('.cm-content').innerText()).toBe(dirty);
});

test('UX-03: create, open, close and reopen Files in every dock', async ({ page }) => {
  await ready(page);
  await show(page, 'sidebar');
  for (const dock of ['left', 'right', 'bottom', 'float'] as const) {
    if (dock !== 'left') {
      await choosePanelMenu(page, 'sidebar', `dock-sidebar-${dock}`);
    }
    await expect(page.locator('[data-panel="sidebar"]')).toHaveAttribute('data-dock', dock);
    await expect(page.getByTestId('file-tree')).toBeVisible();

    await page.getByTestId('tree-new-file').click();
    await page.getByTestId('tree-create-input').fill(`${dock}.pcd`);
    await page.getByTestId('tree-create-input').press('Enter');
    await expect(page.getByTestId(`tab-${dock}.pcd`)).toHaveAttribute('data-active', 'true');
    await page.getByTestId('tree-row-untitled.pcd').locator('.tree-name').click();
    await expect(page.getByTestId('tab-untitled.pcd')).toHaveAttribute('data-active', 'true');

    await choosePanelMenu(page, 'sidebar', 'close-sidebar');
    await expect(page.locator('[data-panel="sidebar"]')).toHaveCount(0);
    await expect(page.getByTestId('tab-untitled.pcd')).toHaveAttribute('data-active', 'true');
    if (dock !== 'float') await show(page, 'sidebar');
  }
});
