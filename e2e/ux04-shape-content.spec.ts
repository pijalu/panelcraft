// SPDX-License-Identifier: GPL-3.0-only
// UX-04: real SVG geometry for label/glyph/icon/badge separation in both themes.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

async function replaceCode(page: Page, text: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page, ['code', 'props']);
  await replaceCode(page, text);
}

async function seedFile(page: Page, path: string, text: string): Promise<void> {
  await openWorkspacePanels(page);
  await page.getByTestId('tree-new-file').click();
  await page.getByTestId('tree-create-input').fill(path);
  await page.getByTestId('tree-create-input').press('Enter');
  await replaceCode(page, text);
}

interface Box { x: number; y: number; width: number; height: number }
interface Overlap { label: string; adornment: string; labelBox: Box; adornmentBox: Box }

/** Read the browser's actual SVG boxes, not the generator's intended geometry. */
async function contentOverlaps(page: Page): Promise<Overlap[]> {
  return page.getByTestId('canvas').locator('g.pc-obj').evaluateAll((groups) => {
    const overlaps: Overlap[] = [];
    const box = (b: DOMRect): Box => ({ x: b.x, y: b.y, width: b.width, height: b.height });
    const intersects = (a: DOMRect, b: DOMRect): boolean =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const group of groups) {
      const labels = [...group.querySelectorAll('text.pc-label:not(.pc-ghost-badge)')];
      const adornments = [...group.querySelectorAll('.pc-glyph, .pc-glyph-icon, text.pc-ghost-badge')];
      for (const label of labels) {
        for (const adornment of adornments) {
          // getBBox excludes an icon path's own translate transform; screen boxes
          // include both local and world transforms and therefore compare paint geometry.
          const labelBox = label.getBoundingClientRect();
          const adornmentBox = adornment.getBoundingClientRect();
          if (intersects(labelBox, adornmentBox)) {
            overlaps.push({
              label: `${group.getAttribute('data-id')}:${label.textContent}`,
              adornment: adornment.getAttribute('class') ?? adornment.tagName,
              labelBox: box(labelBox),
              adornmentBox: box(adornmentBox),
            });
          }
        }
      }
      const glyphs = [...group.querySelectorAll('.pc-glyph')];
      for (const extra of group.querySelectorAll('.pc-glyph-icon, .pc-ghost-badge')) {
        for (const glyph of glyphs) {
          const extraBox = extra.getBoundingClientRect();
          const glyphBox = glyph.getBoundingClientRect();
          if (intersects(extraBox, glyphBox)) {
            overlaps.push({
              label: `${group.getAttribute('data-id')}:${extra.getAttribute('class')}`,
              adornment: glyph.getAttribute('class') ?? glyph.tagName,
              labelBox: box(extraBox),
              adornmentBox: box(glyphBox),
            });
          }
        }
      }
    }
    return overlaps;
  });
}

async function expectSeparated(page: Page): Promise<void> {
  expect(await contentOverlaps(page)).toEqual([]);
  const overflow = await page.getByTestId('canvas').locator('g.pc-obj').evaluateAll((groups) => {
    const bad: string[] = [];
    for (const group of groups) {
      const shape = group.querySelector('.pc-shape')?.getBoundingClientRect();
      if (!shape) continue;
      for (const label of group.querySelectorAll('text.pc-label:not(.pc-ghost-badge)')) {
        const b = label.getBoundingClientRect();
        if (b.left < shape.left - 1 || b.right > shape.right + 1 || b.top < shape.top - 1 || b.bottom > shape.bottom + 1) {
          bad.push(`${group.getAttribute('data-id')}:${label.textContent}`);
        }
      }
    }
    return bad;
  });
  expect(overflow).toEqual([]);
}

const ALL_KINDS = `pcd 1.0

person customer "Preferred Customer Experience" { icon cloud }
system shop "Online Shop Platform" { icon cloud }
system_ext partner "External Partner Platform" { icon cloud }
container web "Customer Web Application" { icon cloud }
component checkout "Checkout Orchestration Component" { icon cloud }
datastore records "Customer Records Store" { icon cloud }
queue jobs "Asynchronous Fulfillment Queue" { icon cloud }
group boundary "Commerce Platform Boundary" { icon cloud }
note memo "Operational Support Note" { icon cloud }

layout saved
position customer (20, 20)
position shop (270, 20)
position partner (520, 20)
position web (20, 180)
position checkout (270, 180)
position records (520, 180)
position jobs (20, 340)
position boundary (270, 340)
position memo (620, 340)
`;

test('UX-04: every palette kind separates wrapped labels, glyphs and icons in both themes', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, ALL_KINDS);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(9);
  await expectSeparated(page);
  await canvas.locator('g.pc-obj[data-id="customer"]').click();
  const aria = await page.locator('body').ariaSnapshot();
  await test.info().attach('ux04-all-kinds-accessibility', { body: aria, contentType: 'text/plain' });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);

  // Give the visual matrix the whole canvas; the geometry above was also
  // checked with both side panels open and an active dependencies panel.
  // Deselect on empty canvas below the matrix — the mini-map overlay owns the
  // lower-right corner, so the point stays left of it.
  await canvas.click({ position: { x: 120, y: 700 } });
  for (const panel of ['code', 'props']) {
    await page.getByTestId(`panel-menu-${panel}`).click();
    await page.getByTestId(`close-${panel}`).click();
  }
  await capture(page, 'ux04-all-kinds-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectSeparated(page);
  await capture(page, 'ux04-all-kinds-dark');
  await canvas.locator('g.pc-obj[data-id="customer"]').click();
  await expectSeparated(page);
  await capture(page, 'ux04-selected-person-dark');
});

test('UX-04: live icons and explicit resize retain content regions across reload', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, 'pcd 1.0\n\nsystem api "Payments Orchestration Service"\n');
  const canvas = page.getByTestId('canvas');
  const api = canvas.locator('g.pc-obj[data-id="api"]');
  await api.click();
  await page.getByTestId('prop-style-icon').click();
  await page.getByTestId('icon-search').fill('cloud');
  await page.getByTestId('icon-option-cloud').click();
  await expect(api.locator('.pc-glyph-icon')).not.toHaveCount(0);
  await expectSeparated(page);
  await capture(page, 'ux04-selected-icon-light');

  const handle = canvas.locator('.pc-resize-handle[data-handle="se"]');
  const narrow = (await handle.boundingBox())!;
  await page.mouse.move(narrow.x + narrow.width / 2, narrow.y + narrow.height / 2);
  await page.mouse.down();
  await page.mouse.move(narrow.x - 70, narrow.y + 45, { steps: 8 });
  await page.mouse.up();
  await expectSeparated(page);
  await capture(page, 'ux04-narrow-tall-light');

  const wide = (await canvas.locator('.pc-resize-handle[data-handle="se"]').boundingBox())!;
  await page.mouse.move(wide.x + wide.width / 2, wide.y + wide.height / 2);
  await page.mouse.down();
  await page.mouse.move(wide.x + 125, wide.y - 60, { steps: 8 });
  await page.mouse.up();
  await expectSeparated(page);
  await expect(page.locator('.cm-content')).toContainText('size ');
  await capture(page, 'ux04-wide-short-light');
  await page.reload();
  await expect(canvas.locator('g.pc-obj[data-id="api"] .pc-glyph-icon')).not.toHaveCount(0);
  await expectSeparated(page);
});

test('UX-04: minimum/custom sizes and imported badges stay distinct', async ({ page }) => {
  await page.goto('/');
  await seedFile(page, 'shared/actors.pcd', 'pcd 1.0\n\nperson psp "PSP"\n');
  await seedFile(page, 'svc/main.pcd', `pcd 1.0
import shared as "../shared/actors.pcd"
system api "API"
person p "P" { size 48 32 }
datastore d "D" { size 48 32 }
queue q "Q" { size 48 32 }
note n "N" { size 48 32 }
group g "G" { size 96 48 }
api -> shared.psp as importedLink
`);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj[data-id="shared.psp"]')).toHaveClass(/pc-ghost/);
  await expectSeparated(page);
  for (const panel of ['sidebar', 'code', 'props']) {
    await page.getByTestId(`panel-menu-${panel}`).click();
    await page.getByTestId(`close-${panel}`).click();
  }
  await capture(page, 'ux04-minimum-imported-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectSeparated(page);
  await capture(page, 'ux04-minimum-imported-dark');
});

// UX08-WP07: the icon band, the built-in glyph band and the label block come from
// one content box, so the icon is centred and the label block is centred in what
// is left between the icon and the bottom padding.
test('UX08-WP07: icons sit top-center and label blocks centre in the remaining region', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, ALL_KINDS);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(9);

  const measurements = await canvas.locator('g.pc-obj').evaluateAll((groups) => {
    const out: Array<{ id: string; iconCenterX: number; shapeCenterX: number; labelGapTop: number; labelGapBottom: number }> = [];
    for (const group of groups) {
      const id = group.getAttribute('data-id') ?? '';
      if (id === 'boundary') continue; // groups keep their top-left title
      const shape = group.querySelector('.pc-shape')?.getBoundingClientRect();
      const icon = group.querySelector('.pc-glyph-icon')?.getBoundingClientRect();
      const labels = [...group.querySelectorAll('text.pc-label:not(.pc-ghost-badge)')];
      if (!shape || !icon || labels.length === 0) continue;
      const boxes = labels.map((l) => l.getBoundingClientRect());
      const top = Math.min(...boxes.map((b) => b.top));
      const bottom = Math.max(...boxes.map((b) => b.bottom));
      out.push({
        id,
        iconCenterX: icon.x + icon.width / 2,
        shapeCenterX: shape.x + shape.width / 2,
        labelGapTop: top - (icon.y + icon.height),
        labelGapBottom: shape.y + shape.height - bottom,
      });
    }
    return out;
  });

  expect(measurements.map((m) => m.id).sort()).toEqual(
    ['checkout', 'customer', 'jobs', 'memo', 'partner', 'records', 'shop', 'web'],
  );
  for (const m of measurements) {
    // Nothing escapes the shape in either layout.
    expect(m.labelGapBottom, `${m.id} label→bottom gap`).toBeGreaterThanOrEqual(0);
    expect(m.labelGapBottom, `${m.id} label not bottom-heavy`).toBeLessThan(40);
    // A stacked icon is centred on the shape's content axis (≤1 px rounding) and
    // the label block is balanced between it and the bottom padding. A box too
    // short to stack puts the icon beside the label (documented fallback), where
    // the vertical comparison does not apply.
    if (m.labelGapTop >= 0) {
      expect(Math.abs(m.iconCenterX - m.shapeCenterX), `${m.id} icon center`).toBeLessThanOrEqual(1.5);
      // person/datastore keep their own glyph band between icon and label, so the
      // air above the block includes that band; the other kinds are pure stacks.
      if (!['customer', 'records'].includes(m.id)) {
        expect(Math.abs(m.labelGapTop - m.labelGapBottom), `${m.id} vertical balance`).toBeLessThanOrEqual(20);
      }
    } else {
      expect(m.iconCenterX, `${m.id} inline icon starts at the padding`).toBeLessThan(m.shapeCenterX);
    }
  }

  await capture(page, 'ux08-icon-text-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectSeparated(page);
  await capture(page, 'ux08-icon-text-dark');
});
