// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP09 connection editing: the selected link exposes slidable channels and
// editable bends. Every gesture must reach the file as `waypoint`/`anchor`
// lines, survive a reload and never touch an untouched route.
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';
import { capture } from './lib/screenshots';

const DOC = `pcd 1.0

system a "A"
system b "B"

a -> b as L1 {
  waypoint (300, 200)
}
`;

/** Rendered document text (`.cm-content` virtualises while it is scrolled). */
async function docText(page: Page): Promise<string> {
  return (await page.locator('.cm-line').allInnerTexts()).join('\n');
}

async function seed(page: Page, doc = DOC): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(doc);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
  await waitForStableView(page);
}

/**
 * The canvas fits the diagram once after load, and every client coordinate
 * moves with it. Wait until pan/zoom, geometry and viewport size have all been
 * identical for three consecutive samples before measuring a click point.
 */
async function waitForStableView(page: Page): Promise<void> {
  const snapshot = (): Promise<string> =>
    page.getByTestId('canvas').evaluate((svg) => {
      const world = svg.querySelector('g.pc-world');
      const rect = svg.getBoundingClientRect();
      const route = svg.querySelector('g.pc-link path.pc-route')?.getAttribute('d') ?? '';
      return [
        world?.getAttribute('transform') ?? 'none',
        rect.left, rect.top, rect.width, rect.height, route,
      ].join('|');
    });
  let previous = '';
  let stable = 0;
  await expect
    .poll(async () => {
      const current = await snapshot();
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable < 2) await page.waitForTimeout(150);
      return stable >= 2 ? 'stable' : 'moving';
    }, { timeout: 8000 })
    .toBe('stable');
}

/**
 * Client coordinates for a canvas point. The scene root carries the pan/zoom as
 * `translate(...) scale(...)`, so canvas coordinates are not client coordinates
 * — and the view may still be fitting right after the document loads.
 */
async function toClient(page: Page, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.getByTestId('canvas').evaluate((svg, point) => {
    const world = svg.querySelector('g.pc-world');
    // The scene root has no transform until the first pan/zoom — identity then.
    const m = /translate\(([-\d.e]+)[ ,]([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(
      world?.getAttribute('transform') ?? 'translate(0 0) scale(1)',
    )!;
    const rect = svg.getBoundingClientRect();
    return {
      x: rect.left + Number(m[1]) + point.x * Number(m[3]),
      y: rect.top + Number(m[2]) + point.y * Number(m[3]),
    };
  }, at);
}

/** Select L1 on the clean stretch of its vertical leg (canvas 300,150). */
async function selectLink(page: Page): Promise<void> {
  const at = await toClient(page, { x: 300, y: 150 });
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('canvas').locator('.pc-segment').first()).toBeVisible();
}

/** The first channel handle, its axis and its centre in viewport pixels. */
async function channel(page: Page): Promise<{ axis: 'h' | 'v'; cx: number; cy: number }> {
  const handle = page.getByTestId('canvas').locator('.pc-segment').first();
  const axis = (await handle.getAttribute('data-seg-axis')) as 'h' | 'v';
  const box = (await handle.boundingBox())!;
  return { axis, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

const bends = (page: Page) => page.getByTestId('canvas').locator('.pc-waypoint');

const routeD = (page: Page): Promise<string | null> =>
  page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route').getAttribute('d');

test('UX08-WP09: dragging a channel slides it and persists as a waypoint', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  const { axis, cx, cy } = await channel(page);
  // Drag along the channel's normal: a vertical channel moves horizontally.
  const dx = axis === 'h' ? 0 : 40;
  const dy = axis === 'h' ? 40 : 0;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => docText(page)).not.toContain('waypoint (300, 200)');
  expect(await docText(page)).toContain('waypoint (');
  const moved = await routeD(page);

  // reload: committed bends are document data, not session state
  await page.reload();
  await waitForStableView(page);
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
  await expect.poll(() => routeD(page)).toBe(moved);
});

test('UX08-WP09: clicking a channel without moving adds no geometry', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  const { cx, cy } = await channel(page);
  const before = await docText(page);
  await page.mouse.click(cx, cy);
  expect(await bends(page).count()).toBe(1);
  await expect.poll(() => docText(page)).toBe(before);
});

test('UX08-WP09: Escape cancels a channel drag', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  const { axis, cx, cy } = await channel(page);
  const dx = axis === 'h' ? 0 : 48;
  const dy = axis === 'h' ? 48 : 0;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(() => docText(page)).toContain('waypoint (300, 200)');
});

test('UX08-WP09: double-click adds a bend, Delete removes it', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  const before = await bends(page).count();
  const { cx, cy } = await channel(page);
  await page.mouse.dblclick(cx, cy);
  const inserted = await bends(page).count();
  expect(inserted).toBeGreaterThan(before);

  // The inserted bend takes focus, so Delete removes exactly that bend.
  await page.keyboard.press('Delete');
  expect(await bends(page).count()).toBe(inserted - 1);
});

test('UX08-WP09: keyboard nudges a focused bend by one grid cell', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  const handle = bends(page).first();
  await handle.focus();
  const y0 = Number(await handle.getAttribute('cy'));
  await page.keyboard.press('ArrowDown');
  await expect(bends(page).first()).toHaveAttribute('cy', String(y0 + 8));
});

test('UX08-WP09: Properties sets Start/End anchors and resets the route', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  await expect(page.getByTestId('link-endpoints')).toBeVisible();

  await page.getByTestId('link-anchor-from-side').selectOption('right');
  await expect.poll(() => docText(page)).toContain('anchor from 0.375');

  await page.getByTestId('link-anchor-from-percent').fill('25');
  await expect.poll(() => docText(page)).toContain('anchor from 0.3125');

  await page.getByTestId('link-anchor-to-side').selectOption('bottom');
  await expect.poll(() => docText(page)).toContain('anchor to 0.625');

  await page.getByTestId('link-reset-route').click();
  await expect.poll(() => docText(page)).not.toContain('anchor from');
  expect(await docText(page)).not.toContain('anchor to');
  expect(await docText(page)).not.toContain('waypoint (');

  // Auto is the state the pickers fall back to.
  await expect(page.getByTestId('link-anchor-from-side')).toHaveValue('auto');
  await expect(page.getByTestId('link-anchor-from-percent')).toBeDisabled();
});

test('UX08-WP09: undo restores a reset route', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  await page.getByTestId('link-reset-route').click();
  await expect.poll(() => docText(page)).not.toContain('waypoint (');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => docText(page)).toContain('waypoint (300, 200)');
});

test('UX08-WP09: connection handles and the Endpoints panel filmstrip', async ({ page }) => {
  await seed(page);
  await selectLink(page);
  await expect(page.getByTestId('link-endpoints')).toBeVisible();

  await capture(page, 'ux08-connection-handles-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'ux08-connection-handles-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Every handle is a keyboard target with a spoken name.
  await test.info().attach('ux08-connection-handles-accessibility', {
    body: await page.getByTestId('canvas').ariaSnapshot(),
    contentType: 'text/plain',
  });
  await expect(page.getByTestId('canvas').locator('.pc-segment').first()).toHaveAttribute(
    'aria-label',
    'Slide vertical segment',
  );
  await expect(bends(page).first()).toHaveAttribute('aria-label', 'Bend 1');
});
