import { expect, test, type Page } from '@playwright/test';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person user "Customer"
system app "Shop" { technology "Go" description "Storefront API" tag core }
datastore db "Orders"

user -> app : "buys"
app -> db : "writes"
`;

async function seed(page: Page, text: string): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 15_000,
  });
}

test.describe('F-25 laws-of-UX affordances', () => {
  test('empty file offers the template gallery and inserts a template', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('template-c4')).toBeVisible();
    await page.getByTestId('template-c4').click();
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    await expect(page.locator('.pc-obj[data-id="user"]')).toBeVisible();
    await openWorkspacePanels(page, ['code']);
    // the inserted text is real code, not canvas-only state
    await expect(page.locator('.cm-content')).toContainText('person user');
  });

  test('palette is grouped by C4 level and keeps 32 px hit targets', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('palette-group-context')).toBeVisible();
    await expect(page.getByTestId('palette-group-container')).toBeVisible();
    await expect(page.getByTestId('palette-group-component')).toBeVisible();
    const box = await page.getByTestId('palette-system').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
  });

  test('status pill reports save state and problems, hover card names the object', async ({
    page,
  }) => {
    await seed(page, DOC);
    const pill = page.getByTestId('status-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-dirty', 'false');
    await expect(pill).toContainText('Saved');

    // hover info card (name + technology + description + tags)
    const shape = page.locator('.pc-obj[data-id="app"] .pc-shape').first();
    await shape.hover();
    const card = page.getByTestId('hover-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Shop');
    await expect(card).toContainText('Go');
    await expect(card).toContainText('#core');

    // a broken statement raises the problem chip
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText('pcd 1.0\n\nsystem app "Shop" bogusattr\n');
    await expect(page.getByTestId('problem-chip')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('problem-chip')).toContainText('problem');
  });

  test('screenshot set: clean light, dirty dark, error state', async ({ page }) => {
    await seed(page, DOC);
    await page.screenshot({ path: 'test-results/f25-clean-light.png' });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText(DOC.replace('technology "Go" ', ''));
    await expect(page.getByTestId('status-pill')).toBeVisible();
    await page.screenshot({ path: 'test-results/f25-dirty-dark.png' });

    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText('pcd 1.0\n\nsystem app "Shop" bogusattr\n');
    await expect(page.getByTestId('canvas-stale')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'test-results/f25-error-light.png' });
  });

  test('flow closing card offers replay/export/close (peak-end)', async ({ page }) => {
    await seed(page, `pcd 1.0

system web "Web app"
system api "API"

flow "Checkout" as checkout {
  web -> api : "POST /checkout"
}
`);
    await openFlowSteps(page);
    await page.getByTestId('flow-play-checkout').click();
    await expect(page.getByTestId('playbar')).toBeVisible();
    // let the flow play out, then the closing card appears
    await expect(page.getByTestId('playbar')).toHaveAttribute('data-status', 'ended', {
      timeout: 20_000,
    });
    const card = page.getByTestId('closing-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('cc-replay')).toBeVisible();
    await expect(page.getByTestId('cc-export')).toBeVisible();
    await expect(page.getByTestId('cc-exit')).toBeVisible();
    await page.screenshot({ path: 'test-results/f25-closing-card.png' });
  });
});
