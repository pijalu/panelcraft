// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, boot: the deployed page must name its own revision and load
// nothing from another origin. This is the evidence that a hosted run is a
// statement about the revision the release job published.
import { expect, test } from '@playwright/test';
import { HOSTED_URL, expectServedIdentity, openApp, setDocument, shoot, watchOrigins } from './lib/hosted';
import { openWorkspacePanels } from '../e2e/lib/panels';

test.describe('hosted boot and provenance', () => {
  test('the served page is the published revision and stays self-contained', async ({ page }) => {
    const foreign = await watchOrigins(page);
    await openApp(page);
    const info = await expectServedIdentity(page);

    // The app is usable, not merely served: a document renders.
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, 'pcd 1.0\n\nsystem api "API"\nsystem db "DB"\n\napi -> db : "reads"\n');
    await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
    await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(1);

    // No CDN, no webfonts, no telemetry: every request is the site's own origin.
    expect(foreign, `foreign origins: ${foreign.join(', ')}`).toEqual([]);
    expect(info.assets['index.html']).toMatch(/^[0-9a-f]{64}$/);
    await shoot(page, 'hosted-boot');
    test.info().annotations.push({ type: 'served-sha', description: info.sha });
    test.info().annotations.push({ type: 'site', description: HOSTED_URL });
  });

  test('the shell reloads from the same revision', async ({ page }) => {
    await openApp(page);
    const before = await expectServedIdentity(page);
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    const after = await expectServedIdentity(page);
    expect(after.sha).toBe(before.sha);
    expect(after.assets['index.html']).toBe(before.assets['index.html']);
  });
});
