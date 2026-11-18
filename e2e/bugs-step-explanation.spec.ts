// SPDX-License-Identifier: GPL-3.0-only
// Bug: a step description was a single-line input, and presentation showed it as
// plain text in the transport dock. Real browser evidence: the editor keeps
// multiline Markdown, and presenting renders it in a region beside the drawing
// that never covers the step component being explained.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"

ada -> shop as L1

flow "Checkout" as main {
  ada -> shop : "order" presentation {
    description {
      text "One order, two systems."
      text ""
      text "- Ada sends"
      text "- Shop accepts"
    }
  }
}
`;

/** Object bounds of the step's participants, in screen space, from the canvas. */
async function participantBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('.pc-world [data-id="shop"]').first().boundingBox();
  expect(box, 'the step component is painted').not.toBeNull();
  return box!;
}

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
  await openFlowSteps(page);
  await page.getByTestId('flow-row-main').click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`a step description edits and presents as Markdown beside the drawing (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, theme);

    // The editor is a multiline field that keeps what was typed.
    await page.getByTestId('step-0').click();
    const field = page.getByTestId('insp-description');
    await expect(field).toBeVisible();
    await expect(page.locator('[data-testid="insp-description"]').locator('xpath=self::textarea')).toHaveCount(1);
    await expect(field).toHaveValue('One order, two systems.\n\n- Ada sends\n- Shop accepts');
    // Typing a fourth line grows the field rather than scrollbarring at two.
    const before = (await field.boundingBox())!;
    await field.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n- Ada waits');
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
    expect((await field.boundingBox())!.height).toBeGreaterThan(before.height);

    // Present: the explanation is rendered Markdown in its own region.
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    await expect(page.getByTestId('present-dock')).toBeVisible();
    const aside = page.getByTestId('step-explanation');
    await expect(aside).toBeVisible();
    await expect(aside.locator('p').first()).toHaveText('One order, two systems.');
    await expect(aside.locator('li')).toHaveCount(3);
    await expect(aside).toContainText('Ada waits');
    // Rendered, not the raw source.
    await expect(aside).not.toContainText('- Ada sends');
    // It is not the transport dock's surface anymore.
    await expect(page.getByTestId('present-description')).toHaveCount(0);

    // It sits beside the drawing: the step component stays fully visible.
    const shop = await participantBox(page);
    const box = (await aside.boundingBox())!;
    const overlapX = Math.max(0, Math.min(box.x + box.width, shop.x + shop.width) - Math.max(box.x, shop.x));
    const overlapY = Math.max(0, Math.min(box.y + box.height, shop.y + shop.height) - Math.max(box.y, shop.y));
    expect(overlapX * overlapY, 'explanation never covers the step component').toBe(0);
    const viewport = page.viewportSize()!;
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await capture(page, `step-explanation-${theme}`, { golden: false });

    // Narrow viewport keeps both readable and unclipped.
    await page.setViewportSize({ width: 720, height: 720 });
    const narrow = (await page.getByTestId('step-explanation').boundingBox())!;
    expect(narrow.x).toBeGreaterThanOrEqual(0);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(720);
    await capture(page, `step-explanation-narrow-${theme}`, { golden: false });

    // Leaving presentation clears the region: no stale explanation remains.
    await page.getByTestId('present-exit').click();
    await expect(page.getByTestId('step-explanation')).toHaveCount(0);
  });
}
