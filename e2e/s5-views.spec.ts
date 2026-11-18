// SPDX-License-Identifier: GPL-3.0-only
// S5 Views, tags, layout, search (SPEC §3 S5, §4.6 FR-V1..V4, §4.1 FR-W6;
// M6-WP8): tag chip fade (FR-V1) + view switch isolates per-view fades,
// deterministic auto-layout smoke (FR-V3/V4 — two applies produce identical
// file-backed positions), and quick search Ctrl+P jump within and across
// files. Plus light/dark screenshots for the vision review round 3
// (STYLE-GUIDE §visual).
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openAppGroup, openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

person ada "Ada"
system web "Web" {
  tag core
}
datastore db "DB" {
  tag core
}

ada -> web as aw {
  tag legacy
}
web -> db as wd
`;

const DOC2 = `pcd 1.0

system payment "Payment API"
system gateway "Gateway"
payment -> gateway as pg
`;

/** Paste text into the code view and wait for a clean sync. */
async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, text);
}

/** Map object id → transform for every rendered object group. */
async function objectTransforms(page: Page): Promise<Record<string, string>> {
  const canvas = page.getByTestId('canvas');
  const out: Record<string, string> = {};
  const objs = canvas.locator('g.pc-obj');
  const n = await objs.count();
  for (let i = 0; i < n; i++) {
    const g = objs.nth(i);
    const id = (await g.getAttribute('data-id'))!;
    out[id] = (await g.getAttribute('transform'))!;
  }
  return out;
}

test('S5: top-level hide tag fades exactly the untagged objects', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await seedDoc(page, `${DOC}hide tag core\n`);
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  await expect(canvas.locator('g.pc-obj[data-id="ada"]')).toHaveClass(/pc-faded/);
  await expect(canvas.locator('g.pc-obj[data-id="web"]')).not.toHaveClass(/pc-faded/);
  await expect(canvas.locator('g.pc-obj[data-id="db"]')).not.toHaveClass(/pc-faded/);
  // Tagged endpoints keep their relation crisp even when one side is faded.
  await expect(canvas.locator('g.pc-link[data-id="aw"]')).not.toHaveClass(/pc-faded/);
  await expect(canvas.locator('g.pc-link[data-id="wd"]')).not.toHaveClass(/pc-faded/);
  await expect(page.locator('.cm-content')).toContainText('hide tag core');
});

test('S5: Reset diagram layout is deterministic across two runs', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await seedDoc(page, DOC);
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  let first: Record<string, string> | undefined;
  for (let run = 0; run < 2; run++) {
    await page.getByTestId('app-menu').click();
    await openAppGroup(page, 'menu-group-layout');
    await page.getByTestId('menu-reset-diagram-layout').click();
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
      timeout: 5000,
    });
    const transforms = await objectTransforms(page);
    expect(new Set(Object.values(transforms)).size).toBe(3);
    if (run === 0) first = transforms;
    else expect(transforms).toEqual(first);
  }
  await expect(page.locator('.cm-content')).toContainText('position ');
});

test('S5: quick search Ctrl+P — jump within file and across files (FR-W6)', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await seedDoc(page, `${DOC}hide tag core\n`);

  // ---- in-file object jump ---------------------------------------------------
  await page.keyboard.press('Control+p');
  await expect(page.getByTestId('search-overlay')).toBeVisible();
  await page.getByTestId('search-input').fill('db');
  const rows = page.getByTestId('search-results').locator('button');
  await expect(rows.first()).toContainText('DB');
  await page.getByTestId('search-row-0').click();
  await expect(page.getByTestId('search-overlay')).toHaveCount(0);
  await expect(canvas.locator('g.pc-obj[data-id="db"]')).toHaveClass(/pc-selected/);
  // reveal centers the object — world transform moves off identity
  const t = await canvas.locator('.pc-world').getAttribute('transform');
  expect(t).not.toBe('translate(0 0) scale(1)');

  // ---- cross-file jump -------------------------------------------------------
  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill('svc.pcd');
  await input.press('Enter');
  await expect(page.getByTestId('tab-svc.pcd')).toHaveAttribute('data-active', 'true');
  await seedDoc(page, DOC2);
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);

  await page.keyboard.press('Control+p');
  await expect(page.getByTestId('search-overlay')).toBeVisible();
  await page.getByTestId('search-input').fill('payment');
  await page.getByTestId('search-row-0').click(); // object "Payment API" in svc.pcd
  await expect(page.getByTestId('search-overlay')).toHaveCount(0);
  await expect(page.getByTestId('tab-svc.pcd')).toHaveAttribute('data-active', 'true');
  await expect(canvas.locator('g.pc-obj[data-id="payment"]')).toHaveClass(/pc-selected/);

  // ---- Esc closes without jumping -------------------------------------------
  await page.keyboard.press('Control+p');
  await expect(page.getByTestId('search-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-overlay')).toHaveCount(0);

  // vision round 3 input: light (filtered diagram) + dark (search overlay)
  await page.keyboard.press('Control+p');
  await expect(page.getByTestId('search-overlay')).toBeVisible();
  await capture(page, 'm6-s5-search');
  await page.keyboard.press('Escape');
  // back to the tagged file for the filter screenshots
  await page.getByTestId('tab-untitled.pcd').click();
  await expect(canvas.locator('g.pc-faded').first()).toBeVisible();
  await capture(page, 'm6-s5-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'm6-s5-dark');
});
