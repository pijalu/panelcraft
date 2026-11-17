// SPDX-License-Identifier: GPL-3.0-only
// Item 16: genuine C4 drill-down with breadcrumbs, a parent boundary and an
// embedded source viewer — in the real editor, offline.
//
// The journey the bug asked for: a system opens its container diagram, the
// container opens its component diagram, and the breadcrumbs walk back. The child
// is a *subordinate* file (parent boundary + trail), never a ghost and never a
// hyperlink.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels, setAppTheme } from './lib/panels';

const CONTEXT = `pcd 1.0
title "Shop context"
level context
person shopper "Shopper"
system shop "Webshop" {
  description "Storefront"
  drilldown "../containers/shop.pcd"
  source {
    language "ts"
    text "export function charge(total: number) {"
    text "  return total * 1.2;"
    text "}"
  }
}
system_ext psp "Payment provider"
shopper -> shop : "browses"
shop -requests-> psp : "charges"
`;

const CONTAINERS = `pcd 1.0
title "Shop containers"
level container
layout auto LR
container api "Checkout API" {
  drilldown "../components/api.pcd"
}
datastore db "Orders DB"
api -> db
`;

const COMPONENTS = `pcd 1.0
title "API components"
level component
component handler "Handler"
component repo "Repository"
handler -> repo
`;

async function seedFile(page: Page, path: string, text: string): Promise<void> {
  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill(path);
  await input.press('Enter');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

/** Select an object on the canvas so the properties panel shows it. */
async function select(page: Page, id: string): Promise<void> {
  await page.getByTestId('canvas').locator(`g.pc-obj[data-id="${id}"]`).click();
}

test('drills system → containers → components and walks back', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  await seedFile(page, 'systems/shop.pcd', CONTEXT);
  await seedFile(page, 'containers/shop.pcd', CONTAINERS);
  await seedFile(page, 'components/api.pcd', COMPONENTS);
  // Back on the system-context diagram to start the journey.
  await page.getByTestId('tab-systems/shop.pcd').click();
  await expect(page.getByTestId('drill-crumbs')).toHaveCount(0);

  await select(page, 'shop');
  await page.getByTestId('prop-open-child').click();

  // Child opens with a trail and a parent boundary — not a ghost, not a link.
  const crumbs = page.getByTestId('drill-crumbs');
  await expect(crumbs).toBeVisible();
  await expect(crumbs).toContainText('Back to shop.pcd');
  await expect(page.getByTestId('parent-context')).toContainText('Webshop');
  await expect(page.locator('.canvas-col')).toHaveAttribute('data-parent', 'Webshop');
  await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]')).toHaveCount(1);
  await capture(page, 'item16-drilldown-containers');
  // Same view in dark: the parent boundary and crumbs must stay legible.
  await setAppTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'item16-drilldown-containers-dark');
  await setAppTheme(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // One level deeper: the container decomposes into components.
  await select(page, 'api');
  await page.getByTestId('prop-open-child').click();
  // The trail names the element that opened each level; the current crumb is the
  // element whose diagram is open now (`Checkout API` opened the components).
  await expect(page.getByTestId('drill-crumbs')).toContainText('Back to Webshop');
  await expect(page.getByTestId('drill-crumbs')).toContainText('Checkout API');

  // Back to the root in one click: the trail truncates, it does not append.
  await page.getByTestId('drill-crumbs').getByText('Back to shop.pcd').click();
  await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]')).toHaveCount(1);
  await expect(page.getByTestId('drill-crumbs')).toHaveCount(0);
});

test('shows embedded source as text and edits it without running it', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  await seedFile(page, 'systems/shop.pcd', CONTEXT);
  await select(page, 'shop');
  await page.getByTestId('prop-open-source').click();

  const read = page.getByTestId('source-read');
  await expect(read).toContainText('export function charge');
  // Text, not markup: nothing in the dialog is a live element.
  await expect(page.locator('dialog script, .dialog script')).toHaveCount(0);

  await page.getByTestId('source-edit').click();
  const editor = page.getByTestId('source-editor');
  await editor.fill('const answer = 42;\n<script>alert(1)</script>;');
  await page.getByTestId('source-save').click();

  // The document carries the new lines and the canvas never draws them.
  await expect(page.locator('.cm-content')).toContainText('const answer = 42;');
  await expect(page.locator('.cm-content')).toContainText('<script>alert(1)</script>');
  await expect(page.getByTestId('canvas')).not.toContainText('const answer = 42;');
  await capture(page, 'item16-source-viewer');
});

test('keeps the context and explains a target that is not in the workspace', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  await seedFile(page, 'systems/shop.pcd', CONTEXT);
  await select(page, 'shop');
  await page.getByTestId('prop-open-child').click();

  // The child file does not exist yet: stay put, say why, offer no navigation.
  await expect(page.getByTestId('drill-notice')).toContainText('not in this workspace');
  await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]')).toHaveCount(1);
  await expect(page.getByTestId('drill-crumbs')).toHaveCount(0);
});
