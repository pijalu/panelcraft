// SPDX-License-Identifier: GPL-3.0-only
// F-10 collapsible/resizable shell (review §3.1 items 1-3): every panel
// collapses to a rail (the code rail keeps the sync chip), the layout persists
// in the workspace record, splitters resize with clamps, keyboard shortcuts
// toggle panels, and the canvas gets its space back at 1280 px.
import { expect, test } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';

// Layout assertions read the whole shell; running them concurrently with other
// specs made the first post-boot click land before the chrome settled. Serial
// keeps the gate deterministic (no retries — agents.md).
test.describe.configure({ mode: 'serial' });

/** Wait until the workspace is initialised (the shell re-renders once on init,
 * which can swallow a click aimed at the very first paint). */
async function ready(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('canvas')).toBeVisible();
  await openWorkspacePanels(page);
  // the files panel proves the workspace record was restored; the sync chip is
  // not a reliable signal here (the code pane may start collapsed)
  await expect(page.locator('.sidebar')).toContainText('untitled.pcd');
}

/** Let the (asynchronous) store write land before reloading — persistence is
 * flushed immediately, but IndexedDB still completes out of band. */
async function settle(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForTimeout(400);
}

/** Canvas width in CSS px. */
async function canvasWidth(page: import('@playwright/test').Page): Promise<number> {
  const box = await page.getByTestId('canvas').boundingBox();
  return Math.round(box?.width ?? 0);
}

test.describe('1280 px viewport', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('F-10: collapsing every panel persists and hands the canvas its width back', async ({ page }) => {
    await page.goto('/');
    const shell = page.getByTestId('app-shell');
    await expect(shell).toBeVisible();
    await ready(page);

    // UX-02 starts secondary panels collapsed; ready() explicitly opens the
    // legacy arrangement so this scenario still exercises collapsing all four.
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
    const before = await canvasWidth(page);

    for (const id of ['sidebar', 'palette', 'code', 'props']) {
      await page.getByTestId(`collapse-${id}`).click();
      // state first (deterministic), then the DOM it must produce
      await expect(page.getByTestId('app-shell')).toHaveAttribute(
        'data-panels',
        new RegExp(`${id}:collapsed`),
      );
      await expect(page.getByTestId(`rail-${id}`)).toHaveCount(1);
      // the toggle reports its state for assistive tech
      await expect(page.getByTestId(`expand-${id}`)).toHaveAttribute('aria-expanded', 'false');
    }
    const collapsed = await canvasWidth(page);
    expect(collapsed).toBeGreaterThanOrEqual(900);
    expect(collapsed).toBeGreaterThan(before);

    // the layout survives a reload (persisted with the workspace record)
    await settle(page);
    await page.reload();
    await expect(page.getByTestId('canvas')).toBeVisible();
    await expect(page.getByTestId('rail-sidebar')).toBeVisible();
    await expect(page.getByTestId('rail-palette')).toBeVisible();
    await expect(page.getByTestId('rail-props')).toBeVisible();
    await expect(page.getByTestId('rail-code')).toBeVisible();
    expect(await canvasWidth(page)).toBeGreaterThanOrEqual(900);

    // expanding restores exactly one panel (the keyboard test covers the
    // shortcuts; this one proves the rail's button works after a reload)
    await settle(page);
    await page.getByTestId('expand-palette').click();
    await expect(page.getByTestId('palette')).toBeVisible();
    await expect(page.getByTestId('rail-palette')).toHaveCount(0);
    await expect(page.getByTestId('rail-sidebar')).toBeVisible();
  });
});

test('F-10: keyboard shortcuts toggle sidebar / code / properties', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const shell = page.getByTestId('app-shell');

  // each shortcut flips exactly its own panel (state is the contract; the DOM
  // follows from it and is asserted through the rail)
  const combos: Array<[string, string]> = [
    ['Control+b', 'sidebar'],
    ['Control+b', 'sidebar'],
    ['Control+j', 'code'],
    ['Control+j', 'code'],
    ['Control+Alt+p', 'props'],
    ['Control+Alt+p', 'props'],
  ];
  let expectCollapsed = true;
  for (const [keys, panel] of combos) {
    await page.keyboard.press(keys);
    await expect(shell).toHaveAttribute(
      'data-panels',
      new RegExp(`${panel}:${expectCollapsed ? 'collapsed' : 'open'}`),
    );
    await expect(page.getByTestId(`rail-${panel}`)).toHaveCount(expectCollapsed ? 1 : 0);
    expectCollapsed = !expectCollapsed;
  }
});

test('F-10: splitters resize a panel within its limits and persist', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const sidebar = page.locator('.sidebar');
  const startWidth = (await sidebar.boundingBox())!.width;

  const splitter = page.getByTestId('splitter-sidebar');
  const box = (await splitter.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();

  const grown = (await sidebar.boundingBox())!.width;
  expect(grown).toBeGreaterThan(startWidth);
  // clamped: never wider than the model's max for the sidebar
  expect(grown).toBeLessThanOrEqual(420);

  await settle(page);
  await page.reload();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByTestId('palette')).toBeVisible();
  expect(Math.round((await page.locator('.sidebar').boundingBox())!.width)).toBe(Math.round(grown));
});
