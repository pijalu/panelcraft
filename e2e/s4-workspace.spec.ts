// SPDX-License-Identifier: GPL-3.0-only
// S4 Workspace (SPEC §3 S4, M3-WP5): build a diagram → export the workspace
// ZIP → clear stored data (typed confirm, FR-S4) → re-import the ZIP → the
// diagram is identical. Also covers FR-S1 reload persistence, FR-S3 quota
// degradation (hand-rolled fake IDB whose put fails with QuotaExceededError —
// no test-only deps in the browser) and FR-S2 private mode. The no-network
// invariant is re-asserted on every scenario.
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { chooseAppMenu, openWorkspacePanels } from './lib/panels';

const EXTERNAL = /^https?:\/\/(?!localhost|127\.0\.0\.1)/;

/** Drop two shapes and rename the system via the properties panel. */
async function buildDiagram(page: Page): Promise<void> {
  await openWorkspacePanels(page);
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const drops = [
    { kind: 'palette-person', x: box.x + 120, y: box.y + 160 },
    { kind: 'palette-system', x: box.x + 420, y: box.y + 160 },
  ];
  for (const d of drops) {
    const item = page.getByTestId(d.kind);
    const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x, d.y, { steps: 5 });
    await page.mouse.up();
  }
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await page.mouse.click(drops[1]!.x, drops[1]!.y);
  const name = page.getByTestId('prop-name');
  await expect(name).toHaveValue(/System/);
  await name.fill('Payment API');
  await name.blur();
  await expect(canvas.locator('g.pc-obj text', { hasText: 'Payment API' })).toBeVisible();
}

/** Click a file row in the tree (opens it / loads it into the canvas). */
async function openInTree(page: Page, name: string): Promise<void> {
  await page.locator(`[data-testid="tree-row-${name}"] .tree-name`).click();
}

/** Export the workspace ZIP via the toolbar; returns raw bytes. */
async function exportZip(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    chooseAppMenu(page, 'tb-export-zip'),
  ]);
  const path = await download.path();
  return new Uint8Array(readFileSync(path!));
}

interface Manifest {
  app: string;
  manifestVersion: number;
  name: string;
  savedAt: number;
  irVersion: number;
  files: string[];
}

function manifestWithoutTime(bytes: Uint8Array): Omit<Manifest, 'savedAt'> & { savedAt?: number } {
  const m = JSON.parse(new TextDecoder().decode(bytes)) as Manifest;
  const { savedAt, ...rest } = m;
  void savedAt;
  return rest;
}

test('S4: zip export → clear storage → import → identical workspace', async ({ page }) => {
  const blockedExternal: string[] = [];
  await page.route(EXTERNAL, (route) => {
    blockedExternal.push(route.request().url());
    return route.abort();
  });

  await page.goto('/');
  await buildDiagram(page);

  // ---- export the workspace ZIP (FR-W5) --------------------------------
  const zip1 = await exportZip(page);
  const entries1 = unzipSync(zip1);
  const manifest1 = manifestWithoutTime(entries1['panelcraft.workspace.json']!);
  expect(manifest1.app).toBe('panelcraft');
  expect(manifest1.manifestVersion).toBe(1);
  expect(manifest1.files).toContain('untitled.pcd');
  expect(new TextDecoder().decode(entries1['untitled.pcd']!)).toContain('Payment API');

  // ---- clear stored data with typed confirm (FR-S4) --------------------
  await chooseAppMenu(page, 'tb-clear-data');
  await expect(page.getByTestId('clear-confirm-btn')).toBeDisabled();
  await page.getByTestId('clear-confirm-input').fill('DELETE');
  await page.getByTestId('clear-confirm-btn').click();
  // welcome file re-bootstrapped, canvas emptied
  await expect(page.getByTestId('tree-row-untitled.pcd')).toBeVisible();
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(0);

  // ---- re-import the ZIP → identical workspace (FR-W5) -----------------
  await page.getByTestId('import-zip-input').setInputFiles({
    name: 'workspace.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zip1),
  });
  await openInTree(page, 'untitled.pcd');
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await expect(canvas.locator('g.pc-obj text', { hasText: 'Payment API' })).toBeVisible();

  // export again → byte-identical file list + contents (modulo savedAt)
  const zip2 = await exportZip(page);
  const entries2 = unzipSync(zip2);
  expect(Object.keys(entries2).sort()).toEqual(Object.keys(entries1).sort());
  expect(new TextDecoder().decode(entries2['untitled.pcd']!)).toBe(
    new TextDecoder().decode(entries1['untitled.pcd']!),
  );
  expect(manifestWithoutTime(entries2['panelcraft.workspace.json']!)).toEqual(manifest1);

  // self-containment holds throughout (S7 invariant)
  expect(blockedExternal).toEqual([]);
});

test('S4: autosaved workspace survives reload (FR-S1)', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const item = page.getByTestId('palette-system');
  const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);

  // wait out the 800 ms trailing autosave, then reload
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(1);
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
});

test('S4: quota failure degrades to in-memory session with banner (FR-S3)', async ({ page }) => {
  // Hand-rolled fake IDB: opens fine, loads fine, every put throws
  // QuotaExceededError — exercises the real app storage path.
  await page.addInitScript(() => {
    const quotaError = new Error('storage quota exceeded');
    quotaError.name = 'QuotaExceededError';
    const mkReq = (): {
      onsuccess: unknown;
      onerror: unknown;
      error: unknown;
      result: unknown;
    } => ({ onsuccess: null, onerror: null, error: null, result: undefined });
    const fireOk = (req: { onsuccess: unknown; result: unknown }, result: unknown): void => {
      setTimeout(() => {
        req.result = result;
        if (typeof req.onsuccess === 'function') req.onsuccess(new Event('success'));
      }, 0);
    };
    const fireErr = (req: { onerror: unknown; error: unknown }, err: unknown): void => {
      setTimeout(() => {
        req.error = err;
        if (typeof req.onerror === 'function') req.onerror(new Event('error'));
      }, 0);
    };
    const store = {
      get: () => {
        const r = mkReq();
        fireOk(r, undefined); // empty workspace
        return r;
      },
      put: () => {
        const r = mkReq();
        fireErr(r, quotaError);
        return r;
      },
      clear: () => {
        const r = mkReq();
        fireOk(r, undefined);
        return r;
      },
    };
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      createObjectStore: (): void => {},
      onversionchange: null,
      close: (): void => {},
      transaction: (): { objectStore: () => typeof store } => ({ objectStore: () => store }),
    };
    Object.defineProperty(window, 'indexedDB', {
      value: {
        open: () => {
          const r = mkReq();
          setTimeout(() => {
            r.result = fakeDb;
            if (typeof r.onsuccess === 'function') (r.onsuccess as (e: Event) => void)(new Event('success'));
          }, 0);
          return r;
        },
      },
      configurable: true,
    });
  });

  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const item = page.getByTestId('palette-person');
  const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);

  // autosave hits the quota wall → session degrades, banner + private on
  await expect(page.getByTestId('banner-quota')).toBeVisible({ timeout: 5000 });
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1); // work kept in memory
  await page.getByTestId('app-menu').click();
  await expect(page.getByTestId('tb-ephemeral')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('banner-ephemeral')).toHaveCount(0); // quota banner replaces the badge
});

test('S4: private mode toggle shows the ephemeral banner (FR-S2)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-menu').click();
  await expect(page.getByTestId('tb-ephemeral')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('banner-ephemeral')).toHaveCount(0);
  await page.getByTestId('tb-ephemeral').click();
  await expect(page.getByTestId('banner-ephemeral')).toBeVisible();
  await expect(page.getByTestId('banner-ephemeral')).toContainText('Private mode');

  await chooseAppMenu(page, 'tb-ephemeral');
  await expect(page.getByTestId('banner-ephemeral')).toHaveCount(0);
});
