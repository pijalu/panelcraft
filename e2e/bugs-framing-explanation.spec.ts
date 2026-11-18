// SPDX-License-Identifier: GPL-3.0-only
// Bug: introduction and conclusion prose was plain narration during a
// presentation, with no Markdown and no way to read it as an explanation. Real
// browser evidence: the framing popover renders the safe Markdown, never covers
// the narration card it explains, dismisses by keyboard and pointer, and reopens.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"

ada -> shop as L1

flow "Checkout" as main {
  intro {
    text "# Before we start"
    text ""
    text "The story runs **left to right**."
  }
  ada -> shop : "order"
  conclusion {
    text "## That is all"
    text ""
    text "One *order*, two systems."
  }
}
`;

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
  await page.getByTestId('flow-play-main').click();
  await page.getByTestId('pb-present').click();
  await expect(page.getByTestId('present-dock')).toBeVisible();
}

/** The popover must sit clear of the narration card and inside the viewport. */
async function checkPlacement(page: Page, kind: 'intro' | 'conclusion'): Promise<void> {
  const pop = page.getByTestId('framing-popover');
  await expect(pop).toBeVisible();
  await expect(pop).toHaveAttribute('data-kind', kind);
  const box = (await pop.boundingBox())!;
  const card = (await page.getByTestId('present-notes').boundingBox())!;
  const viewport = page.viewportSize()!;
  const overlapX = Math.max(0, Math.min(box.x + box.width, card.x + card.width) - Math.max(box.x, card.x));
  const overlapY = Math.max(0, Math.min(box.y + box.height, card.y + card.height) - Math.max(box.y, card.y));
  expect(overlapX * overlapY, 'popover never covers the framing card').toBe(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

for (const theme of ['light', 'dark'] as const) {
  test(`framing prose presents as rendered Markdown (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, theme);

    // Opening beat: the introduction explanation appears on its own. A pointer
    // press anywhere outside it dismisses it, so nothing is clicked before the
    // first assertions.
    await checkPlacement(page, 'intro');
    const pop = page.getByTestId('framing-popover');
    await expect(pop.locator('h3').first()).toHaveText('Before we start');
    await expect(pop.locator('strong').first()).toHaveText('left to right');
    // Markdown, not the raw source.
    await expect(pop).not.toContainText('# Before we start');
    await capture(page, `framing-explanation-intro-${theme}`, { golden: false });

    // Dismissal by keyboard, then reopen from the dock.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('framing-popover')).toHaveCount(0);
    await page.getByTestId('framing-popover-open').click();
    await expect(page.getByTestId('framing-popover')).toBeVisible();
    // Pointer dismissal outside the popover.
    await page.mouse.click(8, 8);
    await expect(page.getByTestId('framing-popover')).toHaveCount(0);

    // Closing beat: a new framing beat shows its own explanation once, with its
    // own Markdown, without any extra click.
    await page.getByTestId('present-dot-3').click();
    await checkPlacement(page, 'conclusion');
    await expect(page.getByTestId('framing-popover').locator('h4').first()).toHaveText('That is all');
    await capture(page, `framing-explanation-conclusion-${theme}`, { golden: false });

    // The middle message step has no framing prose, so no popover is offered.
    await page.getByTestId('present-dot-2').click();
    await expect(page.getByTestId('framing-popover')).toHaveCount(0);
    await expect(page.getByTestId('framing-popover-open')).toHaveCount(0);

    // Narrow viewport: still inside the viewport and clear of the card.
    await page.setViewportSize({ width: 720, height: 720 });
    await page.getByTestId('present-dot-1').click();
    await checkPlacement(page, 'intro');
    await capture(page, `framing-explanation-narrow-${theme}`, { golden: false });
  });
}
