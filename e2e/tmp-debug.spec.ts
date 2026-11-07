import { expect, test } from '@playwright/test';

test('debug: s4 reload @6912e67', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const item = page.getByTestId('palette-system');
  const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1, { timeout: 5000 });
  console.log('RELOAD OK @6912e67');
});
