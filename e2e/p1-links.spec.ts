// SPDX-License-Identifier: GPL-3.0-only
// F-12 arrow/link visual model (review item 10): head/tail/line/width controls
// persist into the link style block, the renderer draws the matching markers,
// `Shift+A` cycles the head, and a link-type colour hint is applied.
// Screenshots of five link styles feed the visual evidence set (light + dark).
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

system a "A"
system b "B"
system c "C"
system d "D"

a -requests-> b as L1
b -reads-> c as L2
c -> d as L3
`;

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  // quiescence first: let any queued machine→editor render land, otherwise the
  // render can splice into the text typed right after `Ctrl+A`
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await seedCode(page, text);
}

async function selectLink(page: Page, id: string): Promise<void> {
  await page.getByTestId('canvas').locator(`g.pc-link[data-id="${id}"] path.pc-route`).click({ force: true });
  await expect(page.getByTestId('link-head')).toBeVisible();
}

test('F-12: head/tail/line/width persist and render after a reload', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-link')).toHaveCount(3);

  await selectLink(page, 'L1');
  await page.getByTestId('link-tail-diamond').click();
  await page.getByTestId('link-head-open').click();
  await page.getByTestId('link-line-dotted').click();
  await page.getByTestId('link-width').fill('3');

  const route = canvas.locator('g.pc-link[data-id="L1"] path.pc-route');
  await expect(route).toHaveAttribute('marker-start', 'url(#pc-marker-diamond)');
  await expect(route).toHaveAttribute('marker-end', 'url(#pc-marker-open)');
  await expect(route).toHaveAttribute('stroke-width', '3');
  await expect(canvas.locator('g.pc-link[data-id="L1"]')).toHaveClass(/pc-dotted/);

  // the code view carries the model inside the link style block
  const content = page.locator('.cm-content');
  await expect(content).toContainText('head open');
  await expect(content).toContainText('tail diamond');
  await expect(content).toContainText('line dotted');
  await expect(content).toContainText('width 3');

  // …and a reload draws the same markers
  await page.reload();
  await expect(canvas.locator('g.pc-link[data-id="L1"] path.pc-route')).toHaveAttribute(
    'marker-start',
    'url(#pc-marker-diamond)',
  );
  await expect(canvas.locator('g.pc-link[data-id="L1"]')).toHaveClass(/pc-dotted/);
});

test('F-12: per-type colour hint is exposed on the link group', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-link[data-id="L1"]')).toHaveAttribute('data-link-type', 'requests');
  await expect(canvas.locator('g.pc-link[data-id="L2"]')).toHaveAttribute('data-link-type', 'reads');
  // an untyped link has no type hint
  await expect(canvas.locator('g.pc-link[data-id="L3"]')).toHaveAttribute('data-link-type', '');
  // the hint is a real style, not just an attribute
  const stroke = await canvas
    .locator('g.pc-link[data-id="L2"] path.pc-route')
    .evaluate((el) => getComputedStyle(el).stroke);
  expect(stroke).not.toBe('');
});

test('F-12: five link styles render and screenshot (light + dark)', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');

  // five distinct link styles in one shot (visual evidence, light + dark)
  await seedDoc(
    page,
    `pcd 1.0

system a "A"
system b "B"

a -requests-> b as L1 {
  style {
    head arrow
    tail diamond
    width 2
  }
}
a -reads-> b as L2 {
  style {
    head open
    line dashed
  }
}
a -writes-> b as L3 {
  style {
    head circle
    line dotted
    width 3
  }
}
a -publishes-> b as L4 {
  style {
    head square
    tail circle
  }
}
a -includes-> b as L5 {
  style {
    head none
    tail arrow
  }
}
`,
  );
  await expect(canvas.locator('g.pc-link')).toHaveCount(5);
  await capture(page, 'p1-links-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p1-links-dark');
});
