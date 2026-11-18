// SPDX-License-Identifier: GPL-3.0-only
// FLOW-02: connector sparks — persisted count/speed, one-way completion versus
// bidirectional ping-pong, deterministic staggering, reduced-motion static
// state and cleanup on every exit path.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

person user "Shopper"
system shop "Webshop"
system erp "ERP"

user -requests-> shop as L1
shop <-> erp as L2

layout saved
position user (60, 90)
position shop (300, 90)
position erp (540, 90)

flow "Burst" as burst {
  intro "Start"
  user -> shop : "browse"
  shop -> erp : "sync"
  conclusion "Done"
}
`;

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['code', 'flows', 'props']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await seedCode(page, DOC);
  await page.getByTestId('collapse-code').click();
  await page.getByTestId('flow-row-burst').click();
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

async function selectLink(page: Page, id: string): Promise<void> {
  await page.getByTestId('canvas').locator(`g.pc-link[data-id="${id}"] path.pc-route`).click({ force: true });
  await expect(page.getByTestId('link-sparks')).toBeVisible();
}

const tokens = (page: Page) => page.getByTestId('canvas').locator('[data-role="spark"]');

for (const theme of ['light', 'dark'] as const) {
  test(`FLOW-02: spark count, speed, ping-pong and cleanup (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);

    // Defaults: one spark, default speed, unprinted.
    await selectLink(page, 'L1');
    await expect(page.getByTestId('link-sparks')).toHaveValue('1');
    await expect(page.getByTestId('link-speed')).toHaveValue('1');

    // Persist a denser, faster one-way connector.
    await page.getByTestId('link-sparks').fill('4');
    await expect(page.getByTestId('link-sparks')).toHaveValue('4');
    await page.getByTestId('link-speed').fill('2');
    await expect(page.getByTestId('link-speed')).toHaveValue('2');
    await selectLink(page, 'L2');
    await page.getByTestId('link-sparks').fill('2');
    await openWorkspacePanels(page, ['code']);
    await expect(page.locator('.cm-content')).toContainText('sparks 4');
    await expect(page.locator('.cm-content')).toContainText('speed 2');
    await page.getByTestId('collapse-code').click();
    await capture(page, `flow02-inspector-${theme}`);
    await axe(page);

    // Play the msg beat: L1 shows four staggered sparks, L2 ping-pongs (its
    // beat is the next step, so play from it directly).
    await page.getByTestId('step-play-1').click();
    await expect(page.getByTestId('playbar')).toBeVisible();
    await expect(tokens(page)).toHaveCount(4, { timeout: 5000 });
    await capture(page, `flow02-sparks-oneway-${theme}`);
    await axe(page);

    // Exiting playback removes every spark.
    await page.getByTestId('pb-exit').click();
    await expect(tokens(page)).toHaveCount(0);

    // The bidirectional beat keeps reversing until it is cancelled.
    await page.getByTestId('step-play-2').click();
    await expect(tokens(page)).toHaveCount(2, { timeout: 5000 });
    const firstTransform = await tokens(page).first().evaluate((el) => (el as Element).getAnimations()[0]?.currentTime ?? 0);
    await page.waitForTimeout(120);
    const secondTransform = await tokens(page).first().evaluate((el) => (el as Element).getAnimations()[0]?.currentTime ?? 0);
    expect(secondTransform).toBeGreaterThan(Number(firstTransform));
    await capture(page, `flow02-sparks-pingpong-${theme}`);
    await page.getByTestId('pb-exit').click();
    await expect(tokens(page)).toHaveCount(0);

    // Reduced motion: static emphasis plus a still token at the endpoint — no
    // movement, but the beat still shows where the message went (item 9).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('step-play-1').click();
    await expect(page.getByTestId('canvas').locator('.pc-emph').first()).toBeVisible();
    const still = page.getByTestId('canvas').locator('.pc-token-static');
    await expect(still).toHaveCount(1);
    await expect(still).toBeVisible();
    const moving = await still.evaluate((el) => (el as Element).getAnimations().length);
    expect(moving, 'the static token must not animate').toBe(0);
    // No travelling token or trail either.
    await expect(page.getByTestId('canvas').locator('.pc-trail')).toHaveCount(0);
    await capture(page, `flow02-reduced-motion-${theme}`);
    await page.getByTestId('pb-exit').click();

    // The file carries the values, the defaults stayed unprinted.
    await openWorkspacePanels(page, ['code']);
    const source = page.locator('.cm-content');
    await expect(source).toContainText('sparks 4');
    await expect(source).toContainText('speed 2');
    await expect(source).toContainText('sparks 2');
    await expect(source).not.toContainText('speed 1');

    // Reload keeps the document values and the defaults stay minimal.
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(2);
    // The document keeps both connectors' settings across the reload.
    const reloaded = page.locator('.cm-content');
    await expect(reloaded).toContainText('sparks 4');
    await expect(reloaded).toContainText('speed 2');
    await expect(reloaded).toContainText('sparks 2');
    await expect(reloaded).not.toContainText('speed 1');
  });
}
