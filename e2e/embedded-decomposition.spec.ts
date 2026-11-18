// SPDX-License-Identifier: GPL-3.0-only
// Decomposition picker + all-or-nothing embedded export + nested editing
// (bugs.md item). The browser journey uses only workspace-local storage.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { capture } from './lib/screenshots';
import { chooseExport, openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const ROOT_LINKED = `pcd 1.0
title "Checkout"
level context
system shop "Webshop" {
  drilldown "containers/shop.pcd"
}
`;

const CHILD = `pcd 1.0
title "Containers"
level container
container api "API" {
  drilldown "../components/api.pcd"
}
`;

const GRANDCHILD = `pcd 1.0
title "Components"
level component
component handler "Handler"
`;

const ROOT_EMBEDDED = `pcd 1.0
title "Shop house"
level context
system shop "Webshop" {
  drilldown embedded "containers/shop.pcd" {
    pcd 1.0
    title "Containers"
    level container
    container api "API" {
      drilldown embedded "components/api.pcd" {
        pcd 1.0
        title "Components"
        level component
        component handler "Handler"
      }
    }
  }
}
`;

async function seedFile(page: Page, path: string, text: string): Promise<void> {
  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill(path);
  await input.press('Enter');
  await seedCode(page, text);
}

async function downloadedText(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-embed-all').click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, 'utf8');
}

test('export choice embeds every transitive child and re-imports without external files', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  await seedFile(page, 'root.pcd', ROOT_LINKED);
  await seedFile(page, 'containers/shop.pcd', CHILD);
  await seedFile(page, 'components/api.pcd', GRANDCHILD);
  await page.getByTestId('tab-root.pcd').click();
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();

  // Known-value picker: a native select, with the authored relative path as a value.
  const picker = page.getByTestId('prop-drill-path');
  await expect(picker).toHaveJSProperty('tagName', 'SELECT');
  await expect(picker).toHaveValue('containers/shop.pcd');
  await expect(picker.locator('option').filter({ hasText: 'containers/shop.pcd' })).toHaveCount(1);
  await expect(picker.locator('option').filter({ hasText: 'components/api.pcd' })).toHaveCount(1);
  await chooseExport(page, 'pcd');
  const dialog = page.getByTestId('export-choice-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('export-keep-linked')).toBeFocused();
  await expect(dialog).toContainText('Embed all decomposition');
  await capture(page, 'embedded-export-choice-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'embedded-export-choice-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  const text = await downloadedText(page);
  expect(text).toContain('drilldown embedded "containers/shop.pcd" {');
  expect(text).toContain('drilldown embedded "components/api.pcd" {');

  // Fresh workspace import: only the downloaded file is supplied.
  await page.getByTestId('import-files-input').setInputFiles({
    name: 'portable.pcd',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByTestId('tab-portable.pcd')).toBeVisible();
  await expect(page.getByTestId('tree-embedded-containers/shop.pcd')).toBeVisible();
  const violations = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.violations).toEqual([]);
});

test('embedded children edit in place through one root document and survive reload', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  await seedFile(page, 'root.pcd', ROOT_EMBEDDED);
  const editor = page.locator('.cm-content');
  await expect(page.getByTestId('tree-embedded-containers/shop.pcd')).toBeVisible();
  await expect(page.getByTestId('tree-embedded-containers/components/api.pcd')).toBeVisible();

  await page.getByTestId('tree-embedded-containers/shop.pcd').click();
  await expect(editor).toContainText('title "Containers"');
  await expect(page.getByTestId('tree-row-root.pcd')).toHaveClass(/active/);
  await expect(page.getByTestId('tree-embedded-containers/shop.pcd')).toHaveClass(/active/);
  await capture(page, 'embedded-tree-child-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'embedded-tree-child-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  await page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]').click();
  const name = page.getByTestId('prop-name');
  await name.fill('API edited');
  await page.getByTestId('tab-root.pcd').click();
  await expect(editor).toContainText('API edited');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('API edited');
  await page.reload();
  await expect(page.getByTestId('tree-embedded-containers/shop.pcd')).toBeVisible();
  await page.getByTestId('tree-embedded-containers/shop.pcd').click();
  await expect(editor).toContainText('title "Containers"');
});
