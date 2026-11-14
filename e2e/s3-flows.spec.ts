// SPDX-License-Identifier: GPL-3.0-only
// S3 Flows & animation (SPEC §3.4, §4.5 FR-F1..F6; M5-WP9): paste a 6-step
// flow (msg + alt chooser + par concurrency + conclusion), play it via the
// sidebar Flows tab, and assert transport, per-beat dim end-states, camera
// movement, alt-branch choice, ARIA narration — plus light/dark screenshots
// for the vision review round 2 (STYLE-GUIDE §visual).
import { expect, test, type Locator } from '@playwright/test';
import { capture } from './lib/screenshots';

const DOC = `pcd 1.0

person ada "Ada"
system web "Web"
datastore db "DB"

ada -> web as aw
web -> db as wd

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send"
  alt "route?" {
    "fast" { process ada }
    "slow" { process web }
  }
  par "fan" {
    { process ada }
    { web -> db : "store" }
  }
  web -> db : "notify"
  conclusion "done"
}
`;

async function expectActorsContained(canvas: Locator, ids: string[]): Promise<void> {
  await expect.poll(async () => {
    const frame = await canvas.boundingBox();
    if (!frame) return false;
    for (const id of ids) {
      const box = await canvas.locator(`g.pc-obj[data-id="${id}"]`).boundingBox();
      if (!box || box.x < frame.x || box.y < frame.y ||
        box.x + box.width > frame.x + frame.width || box.y + box.height > frame.y + frame.height) {
        return false;
      }
    }
    return true;
  }).toBe(true);
}

test('S3: 6-step flow playback — transport, alt chooser, par concurrency, dim, camera', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await expect(canvas).toBeVisible();

  // ---- seed the document (objects + links + flow) via the code view --------
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3, { timeout: 5000 });
  await expect(canvas.locator('g.pc-link')).toHaveCount(2);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });

  // ---- open the Flows tab and start playback --------------------------------
  await page.getByTestId('side-tab-flows').click();
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('flow-play-main').click();

  const playbar = page.getByTestId('playbar');
  await expect(playbar).toBeVisible();
  await expect(playbar).toHaveAttribute('data-status', 'playing');
  // beat 1: intro, ARIA narration hook (FR-F6)
  const narration = page.getByTestId('pb-narration');
  await expect(narration).toHaveText('Kick off');
  await expect(narration).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('pb-progress')).toHaveText('1/7');

  // freeze auto-advance — walk the flow by hand for determinism
  await page.getByTestId('pb-toggle').click();
  await expect(playbar).toHaveAttribute('data-status', 'paused');

  // ---- beat 2: msg — dim end-states + camera moved (FR-F2/F4) ---------------
  await page.getByTestId('pb-step-fwd').click();
  await expect(narration).toHaveText('send');
  await expect(page.getByTestId('pb-progress')).toHaveText('2/7');
  // participants ada/web stay emphasized; db + link wd dim to 25% (class)
  await expect(canvas.locator('g.pc-obj[data-id="db"]')).toHaveClass(/pc-dim/);
  await expect(canvas.locator('g.pc-link[data-id="wd"]')).toHaveClass(/pc-dim/);
  await expect(canvas.locator('g.pc-obj[data-id="ada"]')).not.toHaveClass(/pc-dim/);
  await expect(canvas.locator('g.pc-obj[data-id="web"]')).not.toHaveClass(/pc-dim/);
  // camera glided to the actors — the world transform is no longer identity
  const t = await canvas.locator('.pc-world').getAttribute('transform');
  expect(t).not.toBe('translate(0 0) scale(1)');
  await expectActorsContained(canvas, ['ada', 'web']);

  // ---- beat 3: alt chooser parks playback (FR-F1) ---------------------------
  await page.getByTestId('pb-step-fwd').click();
  await expect(playbar).toHaveAttribute('data-status', 'paused');
  await expect(page.getByTestId('pb-progress')).toHaveText('3/7');
  await expect(narration).toHaveText('route?');
  await expect(page.getByTestId('pb-choice-0')).toHaveText('fast');
  await expect(page.getByTestId('pb-choice-1')).toHaveText('slow');
  await page.getByTestId('pb-choice-1').click(); // take the "slow" branch
  // choose() resumes auto-advance — freeze again for determinism
  await page.getByTestId('pb-toggle').click();
  await expect(playbar).toHaveAttribute('data-status', 'paused');

  // ---- beat 4: chosen branch — process web, everyone else dims --------------
  await expect(narration).toHaveText('Web');
  await expect(page.getByTestId('pb-progress')).toHaveText('4/7');
  await expect(canvas.locator('g.pc-obj[data-id="ada"]')).toHaveClass(/pc-dim/);
  await expect(canvas.locator('g.pc-obj[data-id="web"]')).not.toHaveClass(/pc-dim/);

  // ---- beat 5: par — lane union stays live (concurrency end-state) ----------
  await page.getByTestId('pb-step-fwd').click();
  await expect(narration).toHaveText('fan');
  await expect(page.getByTestId('pb-progress')).toHaveText('5/7');
  // every object participates in a lane; only the unused link aw dims
  await expect(canvas.locator('g.pc-obj[data-id="ada"]')).not.toHaveClass(/pc-dim/);
  await expect(canvas.locator('g.pc-obj[data-id="db"]')).not.toHaveClass(/pc-dim/);
  await expect(canvas.locator('g.pc-link[data-id="aw"]')).toHaveClass(/pc-dim/);

  // ---- beat 6: msg notify — ada remains as recent narrative context ---------
  await page.getByTestId('pb-step-fwd').click();
  await expect(narration).toHaveText('notify');
  await expectActorsContained(canvas, ['web', 'db']);
  const ada = canvas.locator('g.pc-obj[data-id="ada"]');
  await expect(ada).toHaveClass(/pc-dim-history/);
  await expect(ada).not.toHaveClass(/(?:^|\s)pc-dim(?:\s|$)/);
  await expect(ada).toHaveCSS('opacity', '0.55');
  await expect(canvas.locator('g.pc-link[data-id="aw"]')).toHaveClass(/(?:^|\s)pc-dim(?:\s|$)/);
  await expect(canvas.locator('g.pc-obj[data-id="web"]')).not.toHaveClass(/pc-dim/);

  // Vision input: the three-level emphasis state (live/history/dim), light+dark.
  await capture(page, 'm5-s3-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'm5-s3-dark');

  // ---- beat 7: conclusion — flow ends (FR-F1) -------------------------------
  await page.getByTestId('pb-step-fwd').click();
  await expect(narration).toHaveText('done');
  await expect(page.getByTestId('pb-progress')).toHaveText('7/7');

  // exit restores the pre-play viewport (FR-F3) — transform back to identity
  await page.getByTestId('pb-exit').click();
  await expect(playbar).toHaveCount(0);
  await expect(canvas.locator('.pc-world')).toHaveAttribute('transform', 'translate(0 0) scale(1)');
});
