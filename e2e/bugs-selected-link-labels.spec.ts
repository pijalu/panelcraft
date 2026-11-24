// SPDX-License-Identifier: GPL-3.0-only
// Selected connector labels and their segment handles share canvas space. These
// regressions measure the painted boxes in the browser, then exercise the same
// displaced handle through pointer and keyboard input.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';
import { capture } from './lib/screenshots';
import { documentText, seedCode } from './lib/seed';

const DOC = `pcd 1.0

person p "Person 1"
component c "Component 1"

p -> c as L1 {
  waypoint (240, 160)
  waypoint (360, 160)
}
`;

const WRAPPED = 'A wrapped connector label whose painted box covers several lines';
const canvas = (page: Page): Locator => page.getByTestId('canvas');
const route = (page: Page): Locator => canvas(page).locator('g.pc-link[data-id="L1"] path.pc-route');

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

async function box(locator: Locator): Promise<Box> {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return { x: bounds!.x, y: bounds!.y, w: bounds!.width, h: bounds!.height };
}

async function seedAndSelect(page: Page): Promise<number> {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'props']);
  await seedCode(page, DOC);
  await expect(canvas(page).locator('g.pc-obj')).toHaveCount(2);
  await route(page).click({ force: true });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('link-label')).toBeFocused();
  const handles = canvas(page).locator('.pc-segment');
  expect(await handles.count()).toBeGreaterThan(0);
  return handles.count();
}

async function setLabel(page: Page, text: string): Promise<void> {
  await page.getByTestId('link-label').fill(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await expect(canvas(page).locator('.pc-link-label-group[data-id="L1"] .pc-link-label'))
    .toHaveAttribute('aria-label', text);
}

async function expectClear(page: Page): Promise<void> {
  const label = await box(canvas(page).locator('.pc-link-label-group[data-id="L1"] .pc-link-label-bg'));
  const handles = canvas(page).locator('.pc-segment');
  for (let index = 0; index < await handles.count(); index++) {
    const handle = await box(handles.nth(index));
    expect(overlaps(label, handle), `segment handle ${index} must clear ${JSON.stringify(label)}`).toBe(false);
  }
}

async function zoom(page: Page, direction: 'in' | 'out', ticks: number): Promise<void> {
  // Anchor on the label so extreme zooms keep the reviewed geometry in frame.
  const label = await box(canvas(page).locator('.pc-link-label-group[data-id="L1"] .pc-link-label-bg'));
  await page.mouse.move(label.x + label.w / 2, label.y + label.h / 2);
  await page.keyboard.down('Control');
  for (let index = 0; index < ticks; index++) {
    await page.mouse.wheel(0, direction === 'out' ? 120 : -120);
  }
  await page.keyboard.up('Control');
}

async function zoomScale(page: Page): Promise<number> {
  return canvas(page).evaluate((svg) => {
    const transform = svg.querySelector('g.pc-world')?.getAttribute('transform') ?? '';
    return Number(/scale\(([-\d.e]+)\)/.exec(transform)?.[1]);
  });
}

test('selected-link label and every channel handle stay legible at zoom extremes', async ({ page }) => {
  const channels = await seedAndSelect(page);
  for (const label of ['test', WRAPPED]) {
    await setLabel(page, label);
    expect(await canvas(page).locator('.pc-segment').count()).toBe(channels);
    await expectClear(page);
  }

  await setLabel(page, 'test');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await capture(page, `selected-link-label-handles-${theme}`);
  }

  await zoom(page, 'out', 40);
  await expect.poll(() => zoomScale(page)).toBe(0.1);
  await expectClear(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await capture(page, 'selected-link-label-handles-zoomed-out-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'selected-link-label-handles-zoomed-out-dark');

  await zoom(page, 'in', 60);
  await expect.poll(() => zoomScale(page)).toBe(4);
  await expectClear(page);
  await capture(page, 'selected-link-label-handles-zoomed-in-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await capture(page, 'selected-link-label-handles-zoomed-in-light');
});

test('the label-displaced channel still supports pointer drag and keyboard nudging', async ({ page }) => {
  await seedAndSelect(page);
  await setLabel(page, 'test');
  await expectClear(page);

  const label = await box(canvas(page).locator('.pc-link-label-group[data-id="L1"] .pc-link-label-bg'));
  const handles = canvas(page).locator('.pc-segment');
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < await handles.count(); index++) {
    const candidate = await box(handles.nth(index));
    const distance = Math.hypot(
      candidate.x + candidate.w / 2 - label.x - label.w / 2,
      candidate.y + candidate.h / 2 - label.y - label.h / 2,
    );
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }

  const handle = handles.nth(nearest);
  const axis = await handle.getAttribute('data-seg-axis');
  const before = await route(page).getAttribute('d');
  const grip = await box(handle);
  const dx = axis === 'h' ? 0 : 32;
  const dy = axis === 'h' ? 32 : 0;
  await page.mouse.move(grip.x + grip.w / 2, grip.y + grip.h / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.w / 2 + dx, grip.y + grip.h / 2 + dy, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => route(page).getAttribute('d')).not.toBe(before);
  await expect.poll(() => documentText(page)).toContain('waypoint (');

  const dragged = await route(page).getAttribute('d');
  // Materialising the drag can canonicalise the route and renumber its channels.
  // Focus the equivalent current channel, not a stale pre-drag segment index.
  const focused = canvas(page).locator(`.pc-segment[data-seg-axis="${axis}"]`).first();
  await focused.focus();
  await page.keyboard.press(axis === 'h' ? 'ArrowDown' : 'ArrowRight');
  await expect.poll(() => route(page).getAttribute('d')).not.toBe(dragged);
  await expectClear(page);
});
