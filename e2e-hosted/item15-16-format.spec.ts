// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, items 15 and 16: a document-carried icon renders from its own
// bytes, and a system opens its container diagram with a breadcrumb trail. Both
// are native-format features, so the deployed parser/printer/renderer — not just
// the local one — must support them.
import { expect, test, type Page } from '@playwright/test';
import { openApp, setDocument, shoot } from './lib/hosted';
import { openWorkspacePanels } from '../e2e/lib/panels';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM7 7h10v10H7z"/></svg>';
const B64 = Buffer.from(SVG).toString('base64');

const ICON_DOC = `pcd 1.0
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

const CONTEXT = `pcd 1.0
title "Shop context"
level context
person shopper "Shopper"
system shop "Webshop" {
  drilldown "shop.pcd" view containers
  source {
    language "ts"
    text "export function charge(total: number) {"
    text "  return total * 1.2;"
    text "}"
  }
}
system_ext psp "Payment provider"
shopper -> shop : "browses"
`;

const CONTAINERS = `pcd 1.0
title "Shop containers"
level container
view "Containers" as containers {
  layout auto LR
}
container api "Checkout API"
datastore db "Orders DB"
api -> db
`;

/** Create a workspace file at the root and give it `text`. */
async function seedFile(page: Page, name: string, text: string): Promise<void> {
  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill(name);
  await input.press('Enter');
  await expect(page.getByTestId(`tab-${name}`)).toBeVisible();
  await openWorkspacePanels(page, ['code']);
  await setDocument(page, text);
}

test.describe('item 15 — project icons on the hosted build', () => {
  test('an icon carried by the file renders from its own bytes', async ({ page }) => {
    await openApp(page);
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, ICON_DOC);
    const icon = page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').locator('.pc-glyph-icon').first();
    await expect(icon).toBeVisible();
    expect((await icon.getAttribute('href'))?.startsWith('data:image/svg+xml;base64,')).toBe(true);
    // The built-in glyph beside it draws through its own path, not a fetch.
    await expect(
      page.getByTestId('canvas').locator('g.pc-obj[data-id="cache"]').locator('.pc-glyph-icon').first(),
    ).toBeVisible();
    await shoot(page, 'hosted-item15-icons');
  });
});

test.describe('item 16 — drill-down on the hosted build', () => {
  test('a system opens its container diagram and the breadcrumbs walk back', async ({ page }) => {
    await openApp(page);
    await openWorkspacePanels(page, ['sidebar', 'props']);
    await seedFile(page, 'context.pcd', CONTEXT);
    await seedFile(page, 'shop.pcd', CONTAINERS);

    await page.getByTestId('tab-context.pcd').click();
    await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();
    await page.getByTestId('prop-open-child').click();
    await expect(page.getByTestId('drill-crumbs')).toContainText('Back to context.pcd');
    await expect(page.getByTestId('parent-context')).toContainText('Webshop');
    await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]')).toHaveCount(1);
    await shoot(page, 'hosted-item16-drilldown');

    await page.getByTestId('drill-crumbs').getByText('Back to context.pcd').click();
    await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]')).toHaveCount(1);
    await expect(page.getByTestId('drill-crumbs')).toHaveCount(0);

    // The embedded source is displayed as text, never executed or fetched.
    await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();
    await page.getByTestId('prop-open-source').click();
    await expect(page.getByTestId('source-read')).toContainText('export function charge');
    await expect(page.getByTestId('canvas')).not.toContainText('export function charge');
  });
});
