import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

system api "API Gateway"
datastore store "Main store"

api -> store
`;

async function seed(page: Page, text: string): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, text);
}

test.describe('F-23 diagnostics on canvas', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`UX-07: diagnostic count is visually hidden and recovers accessibly (${colorScheme})`, async ({ page }) => {
      const count = page.getByTestId('diag-count');
      const broken = 'pcd 1.0\n\nsystem api "API Gateway" bogusattr\n';

      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await openWorkspacePanels(page);
      await expect(count).toHaveText('0');
      await capture(page, `ux07-empty-${colorScheme}`);

      // The live region remains in the accessibility tree without participating
      // in visual layout or painting the diagnostic zero over the canvas.
      await expect(count).toHaveCSS('position', 'absolute');
      await expect(count).toHaveCSS('width', '1px');
      await expect(count).toHaveCSS('height', '1px');
      await expect(count).toHaveCSS('clip-path', 'inset(50%)');
      const emptySnapshot = await count.ariaSnapshot();
      expect(emptySnapshot).toContain('status');
      expect(emptySnapshot).toContain('0');
      await test.info().attach(`ux07-empty-${colorScheme}-accessibility`, {
        body: emptySnapshot,
        contentType: 'text/plain',
      });

      await seed(page, DOC);
      await expect(count).toHaveText('0');
      await capture(page, `ux07-valid-${colorScheme}`);

      await seedCode(page, broken, { sync: 'error' });
      await expect(page.getByTestId('canvas-stale')).toBeVisible({ timeout: 15_000 });
      await expect(count).toHaveText('1');
      const errorSnapshot = await count.ariaSnapshot();
      expect(errorSnapshot).toContain('status');
      expect(errorSnapshot).toContain('1');
      await test.info().attach(`ux07-error-${colorScheme}-accessibility`, {
        body: errorSnapshot,
        contentType: 'text/plain',
      });
      await expect(page.getByTestId('canvas-stale')).toContainText('fix 1 problem');
      await capture(page, `ux07-error-${colorScheme}`);

      await seedCode(page, DOC);
      await expect(page.getByTestId('canvas-stale')).toHaveCount(0);
      await expect(count).toHaveText('0');
      await expect(count).toHaveCSS('clip-path', 'inset(50%)');
      const recoveredSnapshot = await count.ariaSnapshot();
      expect(recoveredSnapshot).toContain('0');
      await test.info().attach(`ux07-recovered-${colorScheme}-accessibility`, {
        body: recoveredSnapshot,
        contentType: 'text/plain',
      });
      await capture(page, `ux07-recovered-${colorScheme}`);
    });
  }

  test('a parse error rings the offending object and banners the stale render', async ({ page }) => {
    await seed(page, DOC);
    await expect(page.locator('[data-id="api"]')).toBeVisible();
    await expect(page.getByTestId('canvas-stale')).toHaveCount(0);

    await seedCode(
      page,
      `pcd 1.0

system api "API Gateway" bogusattr
datastore store "Main store"

api -> store
`,
      { sync: 'error' },
    );
    await expect(page.getByTestId('canvas-stale')).toBeVisible();
    await expect(page.locator('[data-id="api"]')).toHaveClass(/pc-error/);
    await expect(page.locator('[data-id="store"]')).not.toHaveClass(/pc-error/);

    await page.screenshot({ path: 'web/test-results/diagnostics-canvas.png' });
  });

  test('fixing the error clears the ring and the banner', async ({ page }) => {
    await seed(page, DOC);
    await seedCode(page, 'pcd 1.0\n\nsystem api "oops" bogusattr\n', { sync: 'error' });
    await expect(page.getByTestId('canvas-stale')).toBeVisible({ timeout: 15_000 });

    await seedCode(page, DOC);
    await expect(page.getByTestId('canvas-stale')).toHaveCount(0);
    await expect(page.locator('[data-id="api"]')).not.toHaveClass(/pc-error/);
  });
});
