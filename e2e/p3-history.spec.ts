import { expect, test, type Page } from '@playwright/test';

const DOC = `pcd 1.0

system api "API Gateway"
datastore store "Main store"

api -> store
`;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 15_000,
  });
}

/** Drag the object's centre by (dx, dy). */
async function dragObject(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const el = page.locator(`.pc-obj[data-id="${id}"] .pc-shape`).first();
  const b = await el.boundingBox();
  if (!b) throw new Error(`no box for ${id}`);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 4 });
  await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe('F-24 unified undo & history', () => {
  test('canvas and code actions share one journal and undo routes by surface', async ({ page }) => {
    await seed(page);
    await expect(page.locator('.pc-obj[data-id="api"]')).toBeVisible();

    // 1. canvas action
    const before = await page.locator('.pc-obj[data-id="api"]').getAttribute('transform');
    await dragObject(page, 'api', 160, 96);
    await expect
      .poll(async () => page.locator('.pc-obj[data-id="api"]').getAttribute('transform'))
      .not.toBe(before);
    const moved = await page.locator('.pc-obj[data-id="api"]').getAttribute('transform');

    // 2. code action
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+End');
    await page.keyboard.insertText('// a comment line\n');
    // '// ...' is a comment in PDL: the machine applies it and goes back to clean,
    // but the journal still records the typing burst.
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
      timeout: 15_000,
    });

    // 3. the journal lists both, newest first
    await page.getByTestId('history-open').click();
    const list = page.getByTestId('history-list');
    await expect(list).toBeVisible();
    await expect(list.locator('.history-row').first()).toHaveAttribute('data-surface', 'code');
    await expect(list.locator('.history-row').nth(1)).toHaveAttribute('data-surface', 'canvas');

    // 4. undo routes to the canvas (the code editor does not have focus)
    await page.getByTestId('history-undo').click();
    await expect
      .poll(async () => page.locator('.pc-obj[data-id="api"]').getAttribute('transform'))
      .toBe(before);
    expect(moved).not.toBe(before);

    // 5. redo puts it back
    await page.getByTestId('history-redo').click();
    await expect
      .poll(async () => page.locator('.pc-obj[data-id="api"]').getAttribute('transform'))
      .toBe(moved ?? '');

    await page.screenshot({ path: 'test-results/history-menu.png' });
  });

  test('the affordance records the seeding edit and closes cleanly', async ({ page }) => {
    await seed(page);
    await page.getByTestId('history-open').click();
    // Typing the document is one code action, so the journal is not empty.
    await expect(page.getByTestId('history-list').locator('.history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-empty')).toHaveCount(0);
    await page.getByTestId('history-close').click();
    await expect(page.getByTestId('history-menu')).toHaveCount(0);
  });
});
