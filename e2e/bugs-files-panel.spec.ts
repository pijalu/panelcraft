// SPDX-License-Identifier: GPL-3.0-only
// Files-panel defects closed together (bugs.md): blank names must be refused with a
// reason, the template gallery must have a file to start in when no tab is open, a
// collapsed rail must sit at its dock's outer edge, and the panel header must own
// both the collapse chevron and the storage explanation (as an info tooltip) while
// the create actions become quiet icon buttons.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu } from './lib/panels';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
}

/** Open a panel that is collapsed (or already open) and wait for its host. */
async function showPanel(page: Page, panel: 'sidebar' | 'flows' | 'palette' | 'code' | 'props'): Promise<void> {
  if ((await page.getByTestId(`panel-title-${panel}`).count()) === 0) {
    await chooseAppMenu(page, `view-panel-${panel}`);
  }
  await expect(page.getByTestId(`panel-title-${panel}`)).toBeVisible();
}

async function openFiles(page: Page): Promise<void> {
  await showPanel(page, 'sidebar');
  await expect(page.getByTestId('file-tree')).toBeVisible();
}

const box = async (page: Page, testId: string) => {
  const value = await page.getByTestId(testId).boundingBox();
  if (value === null) throw new Error(`no box for ${testId}`);
  return value;
};

test('a blank or whitespace-only file name is refused with a reason', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await openFiles(page);

  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill('   ');
  await input.press('Enter');

  // The create row stays open and says why; nothing nameless reaches the tree or
  // the tab strip.
  await expect(page.getByTestId('tree-create-error')).toContainText('Enter a name');
  await expect(input).toBeVisible();
  await expect(page.locator('[data-testid^="tree-row-"]')).toHaveCount(1);
  await expect(page.locator('[data-testid^="tab-close-"]')).toHaveCount(1);
  await capture(page, 'bugs-files-blank-name-refused');

  // A typed surrounding space is trimmed rather than refused.
  await input.fill('  spaced.pcd  ');
  await input.press('Enter');
  await expect(page.getByTestId('tree-row-spaced.pcd')).toBeVisible();
  await expect(page.getByTestId('tab-spaced.pcd')).toBeVisible();
});

test('starting from a template with no open file creates the file it belongs to', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await openFiles(page);

  await page.getByTestId('tab-close-untitled.pcd').click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
  console.log('TABS', await page.evaluate(() => [...document.querySelectorAll('[data-testid^="tab-"]')].map((el) => el.getAttribute('data-testid'))), 'DIALOG', await page.getByTestId('diverged-dialog').count());
  // No file is open, so the code buffer must not claim one is.
  await expect(page.locator('[data-testid^="tab-close-"]')).toHaveCount(0);

  await page.getByTestId('template-c4').click();

  // The template lands in a named file that opens, and the three objects reach the
  // canvas — instead of a buffer nobody saved plus a divergence against the file
  // that was just closed.
  await expect(page.getByTestId('tab-diagram.pcd')).toBeVisible();
  await expect(page.getByTestId('tab-diagram.pcd')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('tree-row-diagram.pcd')).toBeVisible();
  await expect(page.locator('g.pc-obj')).toHaveCount(3);
  await expect(page.getByTestId('diverged-dialog')).toHaveCount(0);
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
  await capture(page, 'bugs-files-template-no-file');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a collapsed rail sits at its dock's outer edge (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    // Mixed left dock: Files and Shapes open, Flow Steps collapsed between them in
    // panel order — the state that used to push the rail into the middle.
    await showPanel(page, 'sidebar');
    await showPanel(page, 'palette');
    await expect(page.getByTestId('rail-flows')).toBeVisible();

    const dockLeft = await box(page, 'dock-left');
    const railLeft = await box(page, 'collapsed-rail-left');
    const files = await box(page, 'panel-title-sidebar');
    expect(Math.abs(railLeft.x - dockLeft.x)).toBeLessThanOrEqual(1);
    expect(railLeft.x + railLeft.width).toBeLessThanOrEqual(files.x + 1);

    // Mixed right dock: Properties open, Code collapsed.
    await showPanel(page, 'props');
    await showPanel(page, 'code');
    await page.getByTestId('collapse-code').click();
    await expect(page.getByTestId('rail-code')).toBeVisible();

    const dockRight = await box(page, 'dock-right');
    const railRight = await box(page, 'collapsed-rail-right');
    expect(Math.abs(railRight.x + railRight.width - (dockRight.x + dockRight.width))).toBeLessThanOrEqual(1);
    await capture(page, `bugs-files-rail-edge-${colorScheme}`);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the header owns the collapse chevron and the storage info icon (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await openFiles(page);

    // The chevron shares the title row and sits between the title and the ⋮ menu.
    const header = await box(page, 'panel-title-sidebar');
    const chevron = await box(page, 'collapse-sidebar');
    const actions = await box(page, 'panel-menu-sidebar');
    expect(Math.abs(chevron.y - header.y)).toBeLessThan(header.height);
    expect(chevron.x).toBeGreaterThanOrEqual(header.x + header.width - 1);
    expect(chevron.x + chevron.width).toBeLessThanOrEqual(actions.x + 1);
    // Collapsing from the header keeps the keyboard contract: focus lands on the rail.
    await page.getByTestId('collapse-sidebar').click();
    await expect(page.getByTestId('expand-sidebar')).toBeFocused();
    await page.getByTestId('expand-sidebar').click();
    await expect(page.getByTestId('file-tree')).toBeVisible();

    // The storage explanation moved behind an info icon beside the title: a button
    // with a name, a description, and the same text as its tooltip.
    const info = page.getByTestId('panel-info-sidebar');
    await expect(info).toHaveAttribute('aria-label', 'Files panel information');
    const descriptionId = await info.getAttribute('aria-describedby');
    const description = descriptionId === null ? '' : await page.locator(`#${descriptionId}`).innerText();
    expect(description.length).toBeGreaterThan(20);
    await expect(page.getByTestId('panel-info-sidebar-tooltip')).toHaveText(description);
    // Nothing announces storage only on hover: the label stays visible too.
    await expect(page.getByTestId('workspace-storage')).toBeVisible();
    await expect(page.locator('.storage-hint')).toHaveCount(0);
    await capture(page, `bugs-files-panel-header-${colorScheme}`);
    // Keyboard focus opens the same explanation hover does.
    await info.focus();
    await expect(page.getByTestId('panel-info-sidebar-tooltip')).toBeVisible();
    await capture(page, `bugs-files-panel-info-${colorScheme}`);

    // Create actions are icon buttons with names and tooltips, at the 32 px floor.
    for (const [testId, name] of [['tree-new-file', 'New file'], ['tree-new-folder', 'New folder']] as const) {
      const button = page.getByTestId(testId);
      await expect(button).toHaveAttribute('aria-label', name);
      await expect(button).toHaveAttribute('title', name);
      const size = await box(page, testId);
      expect(size.width).toBeGreaterThanOrEqual(32);
      expect(size.height).toBeGreaterThanOrEqual(32);
    }

    // A panel without an explanation shows no info icon.
    await showPanel(page, 'props');
    await expect(page.getByTestId('panel-info-props')).toHaveCount(0);
  });
}
