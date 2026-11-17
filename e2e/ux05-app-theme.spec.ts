// SPDX-License-Identifier: GPL-3.0-only
// UX-05: application-only System/Light/Dark preference, persistence, no-flash
// restoration, document/CLI independence and major-surface accessibility.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { chooseAppMenu, chooseExport, choosePanelMenu, openAppGroup, openWorkspacePanels, setAppTheme } from './lib/panels';

const root = (page: Page) => page.locator('html');

async function chooseTheme(page: Page, preference: 'system' | 'light' | 'dark'): Promise<void> {
  await setAppTheme(page, preference);
}

/** The active theme is a checked radio item inside the Application menu. */
async function expectTheme(page: Page, preference: 'system' | 'light' | 'dark'): Promise<void> {
  const trigger = page.getByTestId('app-menu');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await openAppGroup(page, 'menu-group-application');
  await expect(page.getByTestId(`app-theme-${preference}`)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

async function storedTheme(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('panelcraft');
    request.onsuccess = () => {
      const get = request.result.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      get.onsuccess = () => {
        resolve(get.result?.settings?.appTheme);
        request.result.close();
      };
    };
  }));
}

async function replaceCode(page: Page, text: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

test('UX-05: System follows OS, explicit choices persist before first paint, and PDL stays independent', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-theme-preference', 'system');
  await expect(root(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root(page)).toHaveAttribute('data-theme', 'dark');

  await chooseTheme(page, 'light');
  await expect(root(page)).toHaveAttribute('data-theme', 'light');
  expect(await storedTheme(page)).toEqual({ version: 1, preference: 'light' });
  await page.reload();
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-theme', 'light');
  await expect(root(page)).toHaveAttribute('data-theme-preference', 'light');
  await expectTheme(page, 'light');

  await chooseTheme(page, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root(page)).toHaveAttribute('data-theme', 'dark');
  await chooseTheme(page, 'light');
  await openWorkspacePanels(page, ['code']);
  await replaceCode(page, 'pcd 1.0\ntheme dark\nsystem api "API"\n');
  await expect(root(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.cm-content')).toContainText('theme dark');

  await chooseTheme(page, 'dark');
  await expect(root(page)).toHaveAttribute('data-theme', 'dark');
  await replaceCode(page, 'pcd 1.0\ntheme light\nsystem api "API"\n');
  await expect(root(page)).toHaveAttribute('data-theme', 'dark');
  await expect(root(page)).toHaveAttribute('data-theme-preference', 'dark');
  const pending = page.waitForEvent('download');
  await chooseExport(page, 'svg');
  expect((await pending).suggestedFilename()).toBe('untitled.svg');
  await expect(root(page)).toHaveAttribute('data-theme', 'dark');
});

const FLOW_DOC = `pcd 1.0
theme dark
person ada "Ada"
system web "Web"
ada -> web : "request"
flow "Checkout" as main {
  intro "Start"
  ada -> web : "request"
  conclusion "Done"
}
layout saved
position ada (80, 100)
position web (360, 100)
`;

for (const theme of ['light', 'dark'] as const) {
  test(`UX-05: panels, canvas, mini-map, flow visuals and dialogs (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await page.addInitScript((preference) => {
      localStorage.setItem('panelcraft.app-theme', JSON.stringify({ version: 1, preference }));
    }, theme);
    await page.goto('/');
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect(root(page)).toHaveAttribute('data-theme', theme);
    await openWorkspacePanels(page, ['sidebar', 'code', 'props', 'flows']);
    await replaceCode(page, FLOW_DOC);
    await page.getByTestId('flow-row-main').click();
    await expect(page.getByTestId('step-0')).toBeVisible();
    await page.getByTestId('canvas').locator('g.pc-obj[data-id="ada"]').click();
    await expect(page.getByTestId('mini-map')).toBeVisible();
    await capture(page, `ux05-major-surfaces-${theme}`);
    await test.info().attach(`ux05-major-surfaces-${theme}-accessibility`, {
      body: await page.getByTestId('app-shell').ariaSnapshot(), contentType: 'text/plain',
    });
    await axe(page);

    await page.getByTestId('app-menu').click();
    await openAppGroup(page, 'menu-group-application');
    await expect(page.getByTestId(`app-theme-${theme}`)).toBeVisible();
    await capture(page, `ux05-app-menu-${theme}`);
    await axe(page);
    await page.keyboard.press('Escape');

    await choosePanelMenu(page, 'flows', 'dock-flows-float');
    await expect(page.locator('[data-panel="flows"]')).toHaveAttribute('data-dock', 'float');
    await capture(page, `ux05-floating-${theme}`);
    await axe(page);

    await chooseAppMenu(page, 'history-open');
    await expect(page.getByRole('dialog', { name: 'History' })).toBeVisible();
    await capture(page, `ux05-history-${theme}`);
    await axe(page);
    await page.getByTestId('history-close').click();

    await chooseAppMenu(page, 'tb-snapshots');
    await expect(page.getByTestId('snapshots-overlay')).toBeVisible();
    await capture(page, `ux05-snapshots-${theme}`);
    await axe(page);
    await page.getByTestId('snapshot-close').click();

    await chooseAppMenu(page, 'tb-clear-data');
    await expect(page.getByRole('dialog', { name: 'Clear stored data' })).toBeVisible();
    await capture(page, `ux05-clear-dialog-${theme}`);
    await axe(page);
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.keyboard.press('ControlOrMeta+p');
    await expect(page.getByTestId('search-overlay')).toBeVisible();
    await capture(page, `ux05-search-${theme}`);
    await axe(page);
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(root(page)).toHaveAttribute('data-theme', theme);
    await expectTheme(page, theme);
    await expect(page.locator('.cm-content')).toContainText('theme dark');
  });
}
