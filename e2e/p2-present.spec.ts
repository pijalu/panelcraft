// SPDX-License-Identifier: GPL-3.0-only
// F-16 present shell (review §3.5 item 11): playing a flow hides the editor
// chrome, the canvas owns the viewport, the dock shows counter/progress/notes,
// click and keys advance, Esc exits and restores chrome + viewport, and the
// reduced-motion path still advances.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send"
  process web
  conclusion "done"
}
`;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
}

test('F-16: presenting hides chrome, advances by click and key, Esc restores', async ({ page }) => {
  await seed(page);
  await page.getByTestId('panel-menu-code').click();
  await page.getByTestId('dock-code-float').click();
  const floatingTitle = (await page.getByTestId('panel-title-code').boundingBox())!;
  await page.mouse.move(floatingTitle.x + 40, floatingTitle.y + 12);
  await page.mouse.down();
  await page.mouse.move(floatingTitle.x + 540, floatingTitle.y + 212, { steps: 6 });
  await page.mouse.up();
  const shell = page.getByTestId('app-shell');
  const worldBefore =
    (await page.getByTestId('canvas').locator('.pc-world').getAttribute('transform')) ??
    'translate(0 0) scale(1)';

  await page.getByTestId('flow-play-main').click();
  await page.getByTestId('pb-present').click();
  await expect(shell).toHaveAttribute('data-presenting', 'true');
  // editor chrome is gone, the dock is there
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('[data-panel="code"]')).toBeHidden();
  await expect(page.getByTestId('present-dock')).toBeVisible();
  await expect(page.getByTestId('present-counter')).toContainText('/');
  await expect(page.getByTestId('present-notes')).not.toBeEmpty();
  await expect(page.locator('.present-dot').first()).toBeVisible();

  const start = await page.getByTestId('present-counter').innerText();
  await page.getByTestId('present-advance').click({ position: { x: 40, y: 40 } });
  await expect
    .poll(async () => page.getByTestId('present-counter').innerText())
    .not.toBe(start);

  const afterClick = await page.getByTestId('present-counter').innerText();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => page.getByTestId('present-counter').innerText())
    .not.toBe(afterClick);

  // The SVG beat badge (not the dock's text counter) must centre its number
  // on the dot. Measure real glyph geometry in SVG user units: getBBox() is
  // local to the badge group, so both boxes are directly comparable.
  const badge = await page.locator('.pc-badge').first().evaluate((g) => {
    const circle = g.querySelector('circle.pc-badge-dot') as SVGCircleElement;
    const text = g.querySelector('text.pc-badge-num') as SVGTextElement;
    const cb = circle.getBBox();
    const tb = text.getBBox();
    return {
      circleMidY: cb.y + cb.height / 2,
      textMidY: tb.y + tb.height / 2,
      circleMidX: cb.x + cb.width / 2,
      textMidX: tb.x + tb.width / 2,
      label: text.textContent,
    };
  });
  console.log('BADGE_GEOMETRY', JSON.stringify(badge));
  expect(Math.abs(badge.textMidY - badge.circleMidY)).toBeLessThan(1.5);
  expect(Math.abs(badge.textMidX - badge.circleMidX)).toBeLessThan(1.5);

  await capture(page, 'p2-present-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p2-present-dark');

  // Esc exits: chrome returns and the pre-play viewport is restored
  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-presenting', 'false');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('[data-panel="code"]')).toHaveAttribute('data-dock', 'float');
  await expect(page.getByTestId('canvas').locator('.pc-world')).toHaveAttribute('transform', worldBefore);
});

const CHOICE_DOC = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Route" as main {
  intro "Kick off"
  alt "route?" {
    "fast" { process ada }
    "slow" { process web }
  }
  conclusion "done"
}
`;

test('F-16: a chooser waits in present mode, choices advance, R restarts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(CHOICE_DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 5000 });
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('flow-play-main').click();
  await page.getByTestId('pb-present').click();

  // playback blocks on the alt chooser — deterministic paused state
  await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused', { timeout: 5000 });
  const choices = page.getByTestId('present-choices').locator('button');
  await expect(choices).toHaveCount(2);
  const before = await page.getByTestId('present-counter').innerText();
  await choices.first().click();
  await expect.poll(async () => page.getByTestId('present-counter').innerText()).not.toBe(before);
  // Reduced motion applies to the animator as well as the camera: a static
  // emphasis end state, never a pulsing ring.
  await expect(page.locator('.pc-obj.pc-emph')).toHaveCount(1);
  await expect(page.locator('.pc-ring')).toHaveCount(0);

  // R restarts the flow from the first beat
  await page.keyboard.press('r');
  await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'playing');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
});
