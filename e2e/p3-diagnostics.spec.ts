import { expect, test, type Page } from '@playwright/test';

const DOC = `pcd 1.0

system api "API Gateway"
datastore store "Main store"

api -> store
`;

async function seed(page: Page, text: string): Promise<void> {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 15_000,
  });
}

test.describe('F-23 diagnostics on canvas', () => {
  test('a parse error rings the offending object and banners the stale render', async ({ page }) => {
    await seed(page, DOC);
    await expect(page.locator('[data-id="api"]')).toBeVisible();
    await expect(page.getByTestId('canvas-stale')).toHaveCount(0);

    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText(`pcd 1.0

system api "API Gateway" bogusattr
datastore store "Main store"

api -> store
`);
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'error', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('canvas-stale')).toBeVisible();
    await expect(page.locator('[data-id="api"]')).toHaveClass(/pc-error/);
    await expect(page.locator('[data-id="store"]')).not.toHaveClass(/pc-error/);

    await page.screenshot({ path: 'web/test-results/diagnostics-canvas.png' });
  });

  test('fixing the error clears the ring and the banner', async ({ page }) => {
    await seed(page, DOC);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText('pcd 1.0\n\nsystem api "oops" bogusattr\n');
    await expect(page.getByTestId('canvas-stale')).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press('Meta+a');
    await page.keyboard.insertText(DOC);
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('canvas-stale')).toHaveCount(0);
    await expect(page.locator('[data-id="api"]')).not.toHaveClass(/pc-error/);
  });
});
