// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, items 9 and 10: presentation transport answers pointer input and
// keeps the framing honest on the deployed build, and a link-only document is
// presentable straight away from the flow derived from its connections.
import { expect, test, type Page } from '@playwright/test';
import { documentText, openApp, setDocument, shoot } from './lib/hosted';
import { openWorkspacePanels } from '../e2e/lib/panels';

/** Presentation zoom ceiling: a step is not a close-up (item 9). */
const PRESENT_ZOOM_MAX = 1.25;

const FLOW_DOC = `pcd 1.0

direction LR

person ada "Ada"
system shop "Shop"
system bank "Bank"

ada -> shop : "browses"
shop -requests-> bank : "charge" as L1

flow "Checkout" as main {
  intro "Kick off"
  ada -> shop : "pay"
  process shop "Pack"
  conclusion "done"
}
`;

const C4_DOC = `pcd 1.0

person customer "Customer"
system shop "Shop"
system_ext pay "Payment provider"

customer -> shop : "buys"
shop -> pay : "charges"
`;

/** The effective presentation zoom (WAAPI camera included, not just the attribute). */
async function worldScale(page: Page): Promise<number> {
  return page.locator('svg[data-testid="canvas"] g.pc-world').evaluate((el) => {
    const world = el as unknown as SVGGraphicsElement;
    return world.getScreenCTM()?.a ?? 0;
  });
}

test.describe('item 9 — presentation transport on the hosted build', () => {
  test('the transport responds and the camera keeps the diagram around it', async ({ page }) => {
    await openApp(page);
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, FLOW_DOC);
    await openWorkspacePanels(page, ['flows']);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();

    const dock = page.getByTestId('present-dock');
    await expect(dock).toHaveAttribute('data-status', 'playing');
    await page.getByTestId('present-toggle').click();
    await expect(dock).toHaveAttribute('data-status', 'paused');
    await page.getByTestId('present-toggle').click();
    await expect(dock).toHaveAttribute('data-status', 'playing');

    // Pointer input reaches the controls: the advance surface moves the step.
    const before = await page.getByTestId('present-counter').textContent();
    await page.getByTestId('present-advance').click({ position: { x: 220, y: 140 } });
    await expect(page.getByTestId('present-counter')).not.toHaveText(before ?? '');

    // Framing: the automatic zoom is capped, so a message is not a close-up.
    await expect.poll(async () => worldScale(page), { timeout: 8000 }).toBeLessThanOrEqual(PRESENT_ZOOM_MAX + 0.001);
    expect(await worldScale(page)).toBeGreaterThan(0.2);
    await shoot(page, 'hosted-item9-presenting');

    await page.getByTestId('present-exit').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
    // Exiting leaves no animation or token behind.
    await expect(page.getByTestId('canvas').locator('.pc-token')).toHaveCount(0);
  });
});

test.describe('item 10 — derived default flow on the hosted build', () => {
  test('a link-only document is presentable without writing a flow', async ({ page }) => {
    await openApp(page);
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, C4_DOC);
    const before = await documentText(page);

    await page.getByTestId('present-open').click();
    await expect(page.getByTestId('present-launcher')).toBeVisible();
    await expect(page.getByTestId('launcher-derived-default')).toBeVisible();
    await expect(page.getByTestId('launcher-title-default')).toHaveText('Default flow');
    await shoot(page, 'hosted-item10-launcher');

    await page.getByTestId('launcher-flow-default').click();
    await expect(page.getByTestId('present-notes')).toContainText('buys');
    await page.getByTestId('present-next').click();
    await expect(page.getByTestId('present-notes')).toContainText('charges');
    await page.keyboard.press('Escape');

    // Presenting is a read-only act: the file still has no authored flow.
    expect(await documentText(page)).toBe(before);
    expect(await documentText(page)).not.toContain('flow ');
  });
});
