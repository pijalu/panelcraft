// SPDX-License-Identifier: GPL-3.0-only
// CX-04: connector style selection is visual — route geometry, line texture,
// weight and independent head/tail markers are preview tiles in front of a real
// radio group. Choosing one updates the canvas, the file and undo; the choice
// survives a reload, and the tiles stay usable docked, floating, keyboard-only
// and with reduced motion.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { chooseAppMenu, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "A"
system b "B"

a -requests-> b as L1
`;

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(1);
}

function route(page: Page) {
  return page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route');
}

async function selectLink(page: Page): Promise<void> {
  await route(page).click({ force: true });
  await expect(page.getByTestId('link-route')).toBeVisible();
}

async function checked(page: Page, id: string): Promise<string[]> {
  const group = page.getByTestId(id);
  return group.locator('input:checked').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
}

async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.waitForTimeout(250);
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`CX-04: visual connector styles (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);
    await selectLink(page);

    // Every picker starts on its documented default and exposes previews with
    // accessible names.
    await expect.poll(() => checked(page, 'link-head'), { timeout: 15_000 }).toEqual(['arrow']);
    await expect.poll(() => checked(page, 'link-tail'), { timeout: 15_000 }).toEqual(['none']);
    await expect.poll(() => checked(page, 'link-line'), { timeout: 15_000 }).toEqual(['solid']);
    await expect.poll(() => checked(page, 'link-route'), { timeout: 15_000 }).toEqual(['orthogonal']);
    await expect.poll(() => checked(page, 'link-width-preset'), { timeout: 15_000 }).toEqual(['1.5']);
    for (const marker of ['arrow', 'open', 'diamond', 'circle', 'square', 'none']) {
      await expect(page.getByTestId(`link-head-${marker}`).getByRole('radio')).toBeVisible();
    }
    await capture(page, `cx04-pickers-default-${theme}`);
    await axe(page);

    // Route: straight and curved change geometry, orthogonal restores it.
    await page.getByTestId('link-route-straight').click();
    await expect(page.locator('.cm-content')).toContainText('route straight');
    await expect(route(page)).not.toHaveAttribute('d', / C /);
    await page.getByTestId('link-route-curved').click();
    await expect(route(page)).toHaveAttribute('d', / C /);
    await expect(page.locator('.cm-content')).toContainText('route curved');
    await expect.poll(() => checked(page, 'link-route'), { timeout: 15_000 }).toEqual(['curved']);

    // Texture and weight.
    await page.getByTestId('link-line-dotted').click();
    await expect(page.getByTestId('canvas').locator('g.pc-link[data-id="L1"]')).toHaveClass(/pc-dotted/);
    await page.getByTestId('link-line-dashed').click();
    await expect(page.getByTestId('canvas').locator('g.pc-link[data-id="L1"]')).toHaveClass(/pc-dashed/);
    await expect(page.locator('.cm-content')).toContainText('line dashed');
    await page.getByTestId('link-width-preset-3').click();
    await expect(route(page)).toHaveAttribute('stroke-width', '3');
    await expect(page.locator('.cm-content')).toContainText('width 3');
    await expect.poll(() => checked(page, 'link-width-preset'), { timeout: 15_000 }).toEqual(['3']);

    // Independent head/tail markers.
    await page.getByTestId('link-head-diamond').click();
    await page.getByTestId('link-tail-circle').click();
    await expect(route(page)).toHaveAttribute('marker-end', 'url(#pc-marker-diamond)');
    await expect(route(page)).toHaveAttribute('marker-start', 'url(#pc-marker-circle)');
    await expect(page.locator('.cm-content')).toContainText('head diamond');
    await expect(page.locator('.cm-content')).toContainText('tail circle');
    await page.getByTestId('link-head-none').click();
    await expect(route(page)).toHaveAttribute('marker-end', 'none');
    await capture(page, `cx04-style-gallery-${theme}`);
    await axe(page);

    // A custom width outside the presets keeps working and deselects the tiles.
    await page.getByTestId('link-width').fill('2.5');
    await expect(route(page)).toHaveAttribute('stroke-width', '2.5');
    await expect(page.locator('.cm-content')).toContainText('width 2.5');
    await expect.poll(() => checked(page, 'link-width-preset'), { timeout: 15_000 }).toEqual([]);

    // Keyboard: a radio group moves with arrow keys and commits on change.
    await page.getByTestId('link-line-solid').getByRole('radio').press('ArrowRight');
    await expect.poll(() => checked(page, 'link-line'), { timeout: 15_000 }).toEqual(['dashed']);
    await expect(page.getByTestId('canvas').locator('g.pc-link[data-id="L1"]')).toHaveClass(/pc-dashed/);
    // Undo can only pop the style change once that change has been written to the
    // file and the editor is idle again; otherwise a slow runner undoes the
    // previous command (width 2.5) and the pending canvas write re-applies the
    // style afterwards, leaving `dashed` forever (CI runs 43753098455/
    // 43753849347, dark only — light and dark run in parallel workers).
    await expect(page.locator('.cm-content')).toContainText('line dashed', { timeout: 15_000 });
    await settle(page);

    // Undo restores the previous style, redo reapplies it.
    await chooseAppMenu(page, 'history-open');
    await page.getByTestId('history-undo').click();
    await expect.poll(() => checked(page, 'link-line'), { timeout: 15_000 }).toEqual(['solid']);
    await page.getByTestId('history-redo').click();
    await expect.poll(() => checked(page, 'link-line'), { timeout: 15_000 }).toEqual(['dashed']);
    await page.getByTestId('history-close').click();
    const flash = page.getByTestId('banner-flash').getByRole('button', { name: 'dismiss' });
    if (await flash.isVisible()) await flash.click();

    // Floating properties panel: the same tiles work docked and floating.
    await page.getByTestId('panel-menu-props').click();
    await page.getByTestId('dock-props-float').click();
    await expect(page.locator('[data-panel="props"]')).toHaveAttribute('data-dock', 'float');
    await page.getByTestId('link-route-straight').click();
    await expect(page.locator('.cm-content')).toContainText('route straight');
    await capture(page, `cx04-floating-${theme}`);
    await axe(page);
    await page.getByTestId('panel-menu-props').click();
    await page.getByTestId('dock-props-right').click();

    // Reduced motion must not remove the controls or their previews.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByTestId('link-route-straight').getByRole('radio')).toBeChecked();
    await capture(page, `cx04-reduced-motion-${theme}`);

    // Persistence: the chosen style survives a reload.
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(1);
    await selectLink(page);
    await expect.poll(() => checked(page, 'link-route'), { timeout: 15_000 }).toEqual(['straight']);
    await expect.poll(() => checked(page, 'link-head'), { timeout: 15_000 }).toEqual(['none']);
    await expect.poll(() => checked(page, 'link-tail'), { timeout: 15_000 }).toEqual(['circle']);
    await expect(page.locator('.cm-content')).toContainText('width 2.5');
  });
}
