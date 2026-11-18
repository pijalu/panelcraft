// SPDX-License-Identifier: GPL-3.0-only
// UX-02 browser acceptance: canvas-first defaults, every dock, drag indicator,
// floating recovery, resize/persistence, focus, keyboard commands and a11y.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu, choosePanelMenu } from './lib/panels';

type Panel = 'sidebar' | 'flows' | 'palette' | 'code' | 'props';
type Dock = 'left' | 'right' | 'bottom' | 'float';
const PANELS: readonly Panel[] = ['sidebar', 'flows', 'palette', 'code', 'props'];

test.setTimeout(120_000);

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
}

async function show(page: Page, panel: Panel): Promise<void> {
  if (await page.locator(`[data-panel="${panel}"]`).count()) return;
  await chooseAppMenu(page, `view-panel-${panel}`);
  await expect(page.getByTestId(`panel-title-${panel}`)).toBeFocused();
}

async function dock(page: Page, panel: Panel, target: Dock): Promise<void> {
  await show(page, panel);
  if (await page.locator(`[data-panel="${panel}"][data-dock="${target}"]`).count()) return;
  await choosePanelMenu(page, panel, `dock-${panel}-${target}`);
  await expect(page.locator(`[data-panel="${panel}"]`)).toHaveAttribute('data-dock', target);
  await expect(page.getByTestId(`panel-title-${panel}`)).toBeFocused();
}

/** Keyboard-only menu activation. The item must be rendered before it can take
 * focus, otherwise a slow render swallows the Enter and the command silently
 * never runs (the symptom was "panel-title-code not found" under load). */
async function pressMenuItem(page: Page, triggerId: string, itemId: string): Promise<void> {
  await page.getByTestId(triggerId).focus();
  await page.keyboard.press('Enter');
  // The menu primitive focuses its first enabled item when it opens. Waiting for
  // that settled state keeps the following focus() from racing the initial
  // autofocus (under load the race activated the wrong item).
  const menu = page.locator('[role="menu"]').first();
  await expect(menu).toBeVisible();
  await expect(menu.locator('[role="menuitem"]:focus')).toHaveCount(1);
  const item = page.getByTestId(itemId);
  if (await item.count() === 0) {
    // Grouped commands only exist after their submenu opens; reach it with the
    // same ArrowRight a keyboard user would use.
    const groups = menu.locator('button[aria-haspopup="menu"]');
    const count = await groups.count();
    for (let index = 0; index < count; index++) {
      await groups.nth(index).focus();
      await page.keyboard.press('ArrowRight');
      if (await item.count() > 0) break;
    }
  }
  await item.focus();
  await page.keyboard.press('Enter');
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

async function storedCodeDock(page: Page): Promise<unknown> {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('panelcraft');
    request.onsuccess = () => {
      const get = request.result.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      get.onsuccess = () => {
        resolve(get.result?.settings?.layout?.docks?.code);
        request.result.close();
      };
    };
  }));
}

for (const colorScheme of ['light', 'dark'] as const) {

  test(`UX-02: complete dock/float/recovery filmstrip (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);

    await expect(page.getByTestId('app-shell')).toHaveAttribute(
      'data-panels',
      'sidebar:collapsed,flows:collapsed,palette:open,code:collapsed,props:collapsed',
    );
    await expect(page.getByTestId('palette')).toBeVisible();
    for (const panel of ['sidebar', 'flows', 'code', 'props'] as const) {
      await expect(page.getByTestId(`rail-${panel}`)).toBeVisible();
    }
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect(page.getByTestId('app-menu')).toBeVisible();
    await capture(page, `ux02-fresh-${colorScheme}`);
    await test.info().attach(`ux02-fresh-${colorScheme}-accessibility`, {
      body: await page.getByTestId('app-shell').ariaSnapshot(),
      contentType: 'text/plain',
    });
    await axe(page);

    await show(page, 'code');
    const documentBefore = await page.locator('.cm-content').innerText();
    for (const panel of PANELS) await dock(page, panel, 'left');
    await capture(page, `ux02-left-${colorScheme}`);

    // Exercise the HTML5 drag contract and inspect the indicator before drop.
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await page.getByTestId('panel-title-palette').dispatchEvent('dragstart', { dataTransfer: transfer });
    await page.getByTestId('dock-right').dispatchEvent('dragover', { dataTransfer: transfer });
    await expect(page.getByTestId('dock-right')).toHaveClass(/drag-over/);
    await capture(page, `ux02-drag-${colorScheme}`);
    await page.getByTestId('dock-right').dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
    await expect(page.locator('[data-panel="palette"]')).toHaveAttribute('data-dock', 'right');
    for (const panel of PANELS) await dock(page, panel, 'right');
    await capture(page, `ux02-right-${colorScheme}`);

    for (const panel of PANELS) await dock(page, panel, 'bottom');
    await capture(page, `ux02-bottom-${colorScheme}`);
    await dock(page, 'code', 'float');
    const floating = page.locator('[data-panel="code"]');
    const initial = (await floating.boundingBox())!;
    const title = (await page.getByTestId('panel-title-code').boundingBox())!;
    await page.mouse.move(title.x + 40, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(title.x + 160, title.y + title.height / 2 + 70, { steps: 6 });
    await page.mouse.up();
    const moved = (await floating.boundingBox())!;
    expect(moved.x).toBeGreaterThan(initial.x + 80);
    expect(moved.y).toBeGreaterThan(initial.y + 40);

    // Native CSS resize is persisted by the host's pointer-up handler.
    await page.mouse.move(moved.x + moved.width - 2, moved.y + moved.height - 2);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width + 38, moved.y + moved.height + 28, { steps: 4 });
    await page.mouse.up();
    const resized = (await floating.boundingBox())!;
    expect(resized.width).toBeGreaterThan(moved.width + 20);
    expect(resized.height).toBeGreaterThan(moved.height + 15);
    await capture(page, `ux02-floating-${colorScheme}`);

    await page.getByTestId('collapse-code').click();
    await expect(floating).toHaveAttribute('data-dock', 'float');
    await expect(page.getByTestId('expand-code')).toBeVisible();
    await expect(page.getByTestId('expand-code')).toBeFocused();
    await capture(page, `ux02-collapsed-${colorScheme}`);
    await page.getByTestId('expand-code').click();
    await dock(page, 'code', 'left');

    await choosePanelMenu(page, 'palette', 'close-palette');
    await expect(page.locator('[data-panel="palette"]')).toHaveCount(0);
    await expect(page.getByTestId('rail-palette')).toHaveCount(0);
    await expect(page.getByTestId('app-menu')).toBeFocused();
    await capture(page, `ux02-closed-${colorScheme}`);
    await show(page, 'palette');
    await capture(page, `ux02-reopened-${colorScheme}`);

    await chooseAppMenu(page, 'reset-workspace-layout');
    await expect(page.getByTestId('app-shell')).toHaveAttribute(
      'data-panels',
      'sidebar:collapsed,flows:collapsed,palette:open,code:collapsed,props:collapsed',
    );
    await expect(page.getByTestId('panel-title-palette')).toBeFocused();
    await capture(page, `ux02-reset-${colorScheme}`);

    await dock(page, 'code', 'bottom');
    const code = page.locator('[data-panel="code"]');
    const oldHeight = (await code.boundingBox())!.height;
    const horizontal = (await page.getByTestId('splitter-code').boundingBox())!;
    await page.mouse.move(horizontal.x + 100, horizontal.y + 3);
    await page.mouse.down();
    await page.mouse.move(horizontal.x + 100, horizontal.y - 47, { steps: 5 });
    await page.mouse.up();
    const newHeight = (await code.boundingBox())!.height;
    expect(newHeight).toBeGreaterThan(oldHeight + 30);

    const palette = page.locator('[data-panel="palette"]');
    const oldWidth = (await palette.boundingBox())!.width;
    const vertical = (await page.getByTestId('splitter-palette').boundingBox())!;
    await page.mouse.move(vertical.x + 3, vertical.y + 100);
    await page.mouse.down();
    await page.mouse.move(vertical.x + 43, vertical.y + 100, { steps: 5 });
    await page.mouse.up();
    const newWidth = (await palette.boundingBox())!.width;
    expect(newWidth).toBeGreaterThan(oldWidth + 25);
    await expect.poll(() => storedCodeDock(page)).toBe('bottom');

    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect(page.locator('[data-panel="code"]')).toHaveAttribute('data-dock', 'bottom');
    expect(Math.round((await page.locator('[data-panel="code"]').boundingBox())!.height)).toBe(Math.round(newHeight));
    expect(Math.round((await page.locator('[data-panel="palette"]').boundingBox())!.width)).toBe(Math.round(newWidth));
    expect(await page.locator('.cm-content').innerText()).toBe(documentBefore);
    await capture(page, `ux02-restored-${colorScheme}`);

    await page.setViewportSize({ width: 520, height: 640 });
    const header = (await page.locator('.app-header').boundingBox())!;
    const emptyTitle = (await page.locator('.empty-title').boundingBox())!;
    expect(emptyTitle.y).toBeGreaterThanOrEqual(header.y + header.height);
    await expect(page.getByTestId('rail-palette')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await capture(page, `ux02-narrow-${colorScheme}`);
    await axe(page);
  });
}

test('UX-02: unapplied code survives docking, floating, close and reopen', async ({ page }) => {
  await ready(page);
  await show(page, 'code');
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  const dirty = 'pcd 1.0\nsystem';
  await page.keyboard.insertText(dirty);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'error');

  for (const target of ['bottom', 'float', 'right'] as const) {
    await dock(page, 'code', target);
    expect(await page.locator('.cm-content').innerText()).toBe(dirty);
  }
  await choosePanelMenu(page, 'code', 'close-code');
  await expect(page.locator('[data-panel="code"]')).toHaveCount(0);
  await show(page, 'code');
  expect(await page.locator('.cm-content').innerText()).toBe(dirty);
});

test('UX-02: keyboard-only open, dock, float, close, reopen and reset', async ({ page }) => {
  await ready(page);
  await pressMenuItem(page, 'app-menu', 'view-panel-code');
  await expect(page.getByTestId('panel-title-code')).toBeFocused();

  await pressMenuItem(page, 'panel-menu-code', 'dock-code-left');
  await expect(page.locator('[data-panel="code"]')).toHaveAttribute('data-dock', 'left');
  await expect(page.getByTestId('panel-title-code')).toBeFocused();

  await pressMenuItem(page, 'panel-menu-code', 'dock-code-float');
  await expect(page.locator('[data-panel="code"]')).toHaveAttribute('data-dock', 'float');
  await expect(page.getByTestId('panel-title-code')).toBeFocused();

  await pressMenuItem(page, 'panel-menu-code', 'close-code');
  await expect(page.getByTestId('app-menu')).toBeFocused();

  await pressMenuItem(page, 'app-menu', 'view-panel-code');
  await expect(page.getByTestId('panel-title-code')).toBeFocused();

  await pressMenuItem(page, 'app-menu', 'reset-workspace-layout');
  await expect(page.getByTestId('panel-title-palette')).toBeFocused();
});
