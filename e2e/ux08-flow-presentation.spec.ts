// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13: presenting is discoverable from the shell (launcher with title,
// purpose, step count and length), the transport narrates the step description,
// per-step camera overrides are authorable without raw PDL, and reduced motion
// still advances the flow with instantly applied framing.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const THEMES = ['light', 'dark'] as const;

/** Drag two shapes from the palette and link them (setup for the authoring path). */
async function seedShapes(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await openWorkspacePanels(page, ['palette']);
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const drops = [
    { kind: 'palette-person', x: box.x + box.width * 0.22, y: box.y + box.height * 0.32 },
    { kind: 'palette-system', x: box.x + box.width * 0.6, y: box.y + box.height * 0.32 },
  ];
  for (const drop of drops) {
    const item = page.getByTestId(drop.kind);
    const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await canvas.locator('g.pc-obj[data-id="o1"]').click();
  const halo = canvas.locator('.pc-halo[data-side="right"]').first();
  await expect(halo).toBeVisible();
  const hb = (await halo.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const target = (await canvas.locator('g.pc-obj[data-id="o2"]').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
}

/** Let the canvas→file write land (the M4 single-writer window). */
async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-state-rail')).toHaveAttribute('data-sync-state', 'clean');
  await page.waitForTimeout(250);
}

/** Seed a diagram plus one message flow, opened in the Flows pane. */
async function seedFlow(page: Page): Promise<void> {
  await seedShapes(page);
  await openWorkspacePanels(page, ['code']);
  await expect(page.locator('.cm-content')).toContainText('->');
  await page.getByTestId('collapse-code').click();
  await openWorkspacePanels(page, ['flows']);
  await expect(page.getByTestId('flow-pane')).toBeVisible();
  await page.getByTestId('flow-add').click();
  await settle(page);
  await page.getByTestId('flow-title').fill('Order walkthrough');
  await settle(page);
  await page.getByTestId('flow-description').fill('How an order reaches the shop');
  await settle(page);
  await page.locator('g.pc-link path.pc-route').first().click();
  await expect(page.getByTestId('add-msg')).toBeEnabled();
  await page.getByTestId('add-msg').click();
  await settle(page);
}

test.describe('UX08-WP13 flow presentation', () => {
  for (const theme of THEMES) {
    test(`launcher lists flows and starts a presentation (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await seedFlow(page);

      const open = page.getByTestId('present-open');
      await expect(open).toBeVisible();
      await open.click();
      const launcher = page.getByTestId('present-launcher');
      await expect(launcher).toBeVisible();
      await expect(page.getByTestId('launcher-title-flow1')).toHaveText('Order walkthrough');
      await expect(page.getByTestId('launcher-desc-flow1')).toHaveText(
        'How an order reaches the shop',
      );
      await expect(page.getByTestId('launcher-meta-flow1')).toContainText('step, about');
      await capture(page, `ux08-presentation-launcher-${theme}`);
      await page.getByTestId('launcher-flow-flow1').click();

      await expect(launcher).toHaveCount(0);
      await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
      await expect(page.getByTestId('present-dock')).toBeVisible();
      await expect(page.getByTestId('present-notes')).not.toBeEmpty();
      // let the camera glide commit before capturing (settled frame, not mid-move)
      await page.waitForTimeout(450);
      await capture(page, `ux08-presentation-step-${theme}`);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
    });
  }

  test('the transport narrates the step description', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedFlow(page);
    await page.getByTestId('step-0').click();
    await page.getByTestId('insp-description').fill('the order leaves the shop');
    await settle(page);
    await page.getByTestId('present-open').click();
    await page.getByTestId('launcher-flow-flow1').click();
    await expect(page.getByTestId('present-description')).toHaveText('the order leaves the shop');
    await page.keyboard.press('Escape');
  });

  test('a Hold camera override is authorable and persisted in the file', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedFlow(page);
    await page.getByTestId('step-0').click();
    await page.getByTestId('insp-camera').selectOption('hold');
    await settle(page);
    await openWorkspacePanels(page, ['code']);
    await expect(page.locator('.cm-content')).toContainText('camera hold');
    await page.getByTestId('collapse-code').click();
    // the override survives a reload of the pane (file is the only truth)
    await expect(page.getByTestId('insp-camera')).toHaveValue('hold');
    await capture(page, 'ux08-presentation-camera-light');
  });

  test('reduced motion presents the same steps without a camera glide', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await seedFlow(page);
    const world = page.locator('.pc-world');
    // Editor framing, read before the shell hands the stage to present mode: the
    // beat re-fits to the wider canvas, so the two must differ. Reading it after
    // the click raced the refit and made the comparison meaningless.
    const editorFrame = await world.getAttribute('transform');
    await page.getByTestId('present-open').click();
    await page.getByTestId('launcher-flow-flow1').click();
    const dock = page.getByTestId('present-dock');
    await expect(dock).toBeVisible();
    // the framing is applied at once (no in-flight glide): after the present
    // layout settles the transform stops changing.
    await page.waitForTimeout(250);
    const first = await world.getAttribute('transform');
    await page.waitForTimeout(80);
    expect(await world.getAttribute('transform')).toBe(first);
    expect(first).not.toBe(editorFrame);
    await expect(page.getByTestId('present-counter')).toHaveText('1 / 1');
    await expect(page.getByTestId('present-notes')).not.toBeEmpty();
    await capture(page, 'ux08-presentation-reduced-motion-light');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
  });
});
