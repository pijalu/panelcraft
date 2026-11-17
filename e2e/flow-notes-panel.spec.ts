// SPDX-License-Identifier: GPL-3.0-only
// Flow Markdown notes: authoring, reload, presentation panel, safe rendering,
// focus and camera refit. Screenshots are captured for the vision review.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const BASE = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send" presentation {
    description "Current step prose."
  }
}
`;

const WITH_NOTES = BASE.replace('flow "Checkout" as main {\n', `flow "Checkout" as main {
  description {
    text "# Notes"
    text ""
    text "**Pay** by card and [details](https://example.test/details)"
    text ""
    text "- one"
    text "- two"
  }
  presentation
`);

async function seed(page: Page, doc: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(doc);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 5000 });
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
}

async function present(page: Page): Promise<void> {
  await page.getByTestId('flow-play-main').click();
  await page.getByTestId('pb-present').click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
}

test('notes persist, render safely, keep step prose separate and do not steal focus', async ({ page }) => {
  await seed(page, BASE);
  await page.getByTestId('flow-row-main').click();
  await page.getByTestId('flow-notes').fill(
    '# Notes\n\n**Pay** by card and [details](https://example.test/details)\n\n<script>raw()</script> [bad](javascript:alert(1))',
  );
  await page.getByTestId('flow-present-notes').click();
  await expect(page.getByTestId('flow-present-notes')).toBeChecked();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 5000 });
  const source = await page.locator('.cm-content').innerText();
  expect(source).toContain('description {');
  expect(source).toContain('presentation');

  await page.reload();
  await openWorkspacePanels(page);
  await openFlowSteps(page);
  await page.getByTestId('flow-row-main').click();
  expect(await page.getByTestId('flow-notes').inputValue()).toContain('# Notes');
  expect(await page.getByTestId('flow-present-notes').isChecked()).toBe(true);

  await present(page);
  const aside = page.getByTestId('flow-notes-panel');
  await expect(aside).toBeVisible();
  await expect(aside).toHaveAttribute('aria-label', 'Flow notes');
  await expect(aside.getByRole('heading', { level: 3 })).toHaveText('Notes');
  await expect(aside.locator('strong')).toHaveText('Pay');
  await expect(aside.locator('a[href="https://example.test/details"]')).toHaveCount(1);
  await expect(aside.locator('script')).toHaveCount(0);
  await expect(aside.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(aside).toContainText('<script>raw()</script>');
  await expect(page.getByTestId('present-description')).toHaveCount(0);

  // Global transport keys work while a dock button holds focus; the panel
  // never pulls focus into itself.
  await page.getByTestId('present-toggle').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('present-toggle')).toBeFocused();
  await expect(page.getByTestId('present-description')).toHaveText('Current step prose.');
  expect(await aside.locator('strong').innerText()).toBe('Pay');

  const violations = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await capture(page, 'flow-notes-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'flow-notes-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 480, height: 780 });
  await expect(aside).toBeVisible();
  await expect.poll(async () => {
    const actor = await page.locator('.pc-obj[data-id="ada"]').boundingBox();
    return actor !== null && actor.x >= 0 && actor.x + actor.width <= 480;
  }).toBe(true);
  const box = await aside.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThan(480);
  await capture(page, 'flow-notes-narrow');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
});

test('no panel without the flag, and the panel refits the canvas', async ({ page }) => {
  await seed(page, WITH_NOTES.replace('  presentation\n', ''));
  await present(page);
  await expect(page.getByTestId('flow-notes-panel')).toHaveCount(0);
  const wide = await page.getByTestId('canvas').boundingBox();
  await page.keyboard.press('Escape');

  await seed(page, WITH_NOTES);
  await present(page);
  await expect(page.getByTestId('flow-notes-panel')).toBeVisible();
  const narrow = await page.getByTestId('canvas').boundingBox();
  expect(wide).not.toBeNull();
  expect(narrow).not.toBeNull();
  expect(narrow!.width).toBeLessThan(wide!.width - 100);
  await page.keyboard.press('Escape');
});
