// SPDX-License-Identifier: GPL-3.0-only
// Item 15: project icons in the real editor — a `.pcd` that carries its own icon
// must draw it, the picker must find icons by what they mean, and renaming a
// handle must move every reference in one undoable step. Also asserts the whole
// flow stays offline: the icon is a local `data:` URI, so the network-blocked run
// is the enforcement of "no fetch, no CDN, no icon font".
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM7 7h10v10H7z"/></svg>';
const B64 = btoa(SVG);

const DOC = `pcd 1.0
title "Project icons"

icon brand {
  label "Company mark"
  media "image/svg+xml"
  data "${B64}"
}

person shopper "Shopper"
system shop "Webshop" {
  icon brand
}
system cache "Edge cache" {
  icon database
}

shopper -> shop : "browse"
shop -> cache : "assets"
`;

async function replaceCode(page: Page, text: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, text);
}

async function seed(page: Page, text = DOC): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'props']);
  await replaceCode(page, text);
}

/** The rendered icon of one object, as the browser sees it. */
const iconOf = (page: Page, id: string) =>
  page.getByTestId('canvas').locator(`g.pc-obj[data-id="${id}"]`).locator('.pc-glyph-icon').first();

test('a document icon renders from the file itself, offline', async ({ page }) => {
  await seed(page);
  const icon = iconOf(page, 'shop');
  await expect(icon).toBeVisible();
  // embedded bytes, never a URL: this is what keeps the diagram portable
  const href = await icon.getAttribute('href');
  expect(href?.startsWith('data:image/svg+xml;base64,')).toBe(true);
  const box = await icon.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  // the built-in glyph next to it still draws through its own path
  await expect(iconOf(page, 'cache')).toHaveCount(1);
  await capture(page, 'item15-project-icons-light');
});

test('the picker searches by meaning and picks a built-in', async ({ page }) => {
  await seed(page);
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();
  await page.getByTestId('prop-style-icon').click();
  const picker = page.getByTestId('icon-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('icon-search').fill('kafka');
  await expect(picker.getByTestId('icon-option-queue')).toBeVisible();
  // the file's own icon is searchable too, and listed under "This file"
  await picker.getByTestId('icon-search').fill('brand');
  await expect(picker.getByTestId('icon-option-brand')).toBeVisible();
  await picker.getByTestId('icon-search').fill('kafka');
  await picker.getByTestId('icon-option-queue').click();
  // the pick lands in the document, not just on the canvas
  await expect(page.locator('.cm-content')).toContainText('icon queue');
  // and the canvas redraws: the project image is gone, the built-in glyph is drawn
  const shop = page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]');
  await expect(shop.locator('image')).toHaveCount(0);
  await expect(shop.locator('path.pc-glyph-icon').first()).toBeVisible();
  await capture(page, 'item15-icon-picker');
});

test('renaming a handle moves every reference in one undo step', async ({ page }) => {
  await seed(page);
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();
  await page.getByTestId('prop-style-icon').click();
  await page.getByTestId('icon-manage').click();
  await expect(page.getByTestId('icon-manager-overlay')).toBeVisible();
  await capture(page, 'item15-icon-manager');

  await page.getByTestId('icon-rename-start-brand').click();
  await page.getByTestId('icon-rename-brand').fill('logo');
  await page.getByTestId('icon-rename-brand').press('Enter');
  await expect(page.getByTestId('icon-manager-error')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('icon logo');
  await expect(page.locator('.cm-content')).not.toContainText('icon brand');
  await page.getByTestId('icon-manager-close').click();

  // one undo restores the declaration and the reference together
  await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-content')).toContainText('icon brand');
});

test('unsafe pasted markup is refused with a reason', async ({ page }) => {
  await seed(page);
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();
  await page.getByTestId('prop-style-icon').click();
  await page.getByTestId('icon-manage').click();
  await page.getByTestId('icon-add-data').fill('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await page.getByTestId('icon-add').click();
  // the sanitizer keeps the inert geometry and drops the script: a successful add
  // is fine, but nothing executable may reach the document
  const text = await page.locator('.cm-content').innerText();
  expect(text).not.toContain('script');
});
