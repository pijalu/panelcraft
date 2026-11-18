// SPDX-License-Identifier: GPL-3.0-only
// Bug: the Flow properties prose fields used fixed heights and an uneven
// layout, and the step Description used a compact label-beside-control row.
// Real-browser evidence: every prose field shares one width, one label rhythm
// and one hint position, and a multiline field grows with its content instead of
// showing a scrollbar at two lines. Captures: empty, short, long, narrow, both
// themes.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"

ada -> shop as L1

layout saved
position ada (60, 140)
position shop (320, 140)

flow "Checkout" as checkout {
  intro "Start"
  ada -> shop : "order"
  conclusion "Done"
}
`;

const LONG_NOTES = Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of the walkthrough notes.`).join('\n');

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
  await openFlowSteps(page);
  await page.getByTestId('flow-row-checkout').click();
  await expect(page.getByTestId('flow-properties')).toBeVisible();
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rendered geometry of every prose field and its controls. */
async function geometry(page: Page): Promise<{
  fields: { id: string; label: Box; control: Box; hint: Box | null; stacked: boolean }[];
}> {
  return page.evaluate(() => {
    const ids = ['flow-title', 'flow-description', 'flow-notes', 'flow-intro', 'flow-conclusion'];
    const box = (el: Element | null): Box | null => {
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const fields = ids.map((id) => {
      const control = document.querySelector(`[data-testid="${id}"]`);
      const field = control?.closest('.flow-field') ?? null;
      const hint = field?.querySelector('.flow-field-hint') ?? null;
      return {
        id,
        stacked: field?.classList.contains('flow-field-stacked') ?? false,
        label: box(field?.querySelector('.flow-field-label') ?? null)!,
        control: box(control)!,
        hint: box(hint),
      };
    });
    return { fields };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`flow properties share one field layout and grow with their text (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, theme);

    // Empty: the panel keeps a stable, readable height for every field.
    const empty = await geometry(page);
    for (const field of empty.fields) {
      expect(field.stacked, `${field.id} uses the stacked layout`).toBe(true);
      expect(field.hint, `${field.id} states its hint once, under the label`).not.toBeNull();
      // Hint sits between the label and the control, in the same place for all.
      expect(field.hint!.y).toBeGreaterThanOrEqual(field.label.y + field.label.height - 1);
      expect(field.hint!.y).toBeLessThanOrEqual(field.control.y + 1);
    }
    // One width and one left edge for the whole set: no field keeps its own measure.
    const widths = empty.fields.map((field) => Math.round(field.control.width));
    expect(new Set(widths).size, `control widths ${widths.join(',')}`).toBe(1);
    const lefts = empty.fields.map((field) => Math.round(field.control.x));
    expect(new Set(lefts).size, `control left edges ${lefts.join(',')}`).toBe(1);
    // The Presentation group's select follows the same measure, so the panel has
    // one column rather than two competing widths.
    const illustration = await page.getByTestId('flow-illustration').boundingBox();
    expect(Math.round(illustration!.x)).toBe(lefts[0]);
    expect(Math.round(illustration!.width)).toBe(widths[0]);
    await capture(page, `flow-fields-empty-${theme}`, { golden: false });

    // Short text: the fields keep their minimum height instead of collapsing.
    await page.getByTestId('flow-description').click();
    await page.keyboard.type('Paying for an order');
    await page.getByTestId('flow-intro').click();
    await page.keyboard.type('Start here');
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
    const short = await geometry(page);
    const notesField = short.fields.find((field) => field.id === 'flow-notes')!;
    const purposeField = short.fields.find((field) => field.id === 'flow-description')!;
    expect(notesField.control.height).toBeGreaterThanOrEqual(40);
    expect(Math.abs(purposeField.control.height - notesField.control.height)).toBeLessThanOrEqual(2);
    await capture(page, `flow-fields-short-${theme}`, { golden: false });

    // Long text: the notes field grows, and only then scrolls.
    const notesBefore = notesField.control.height;
    await page.getByTestId('flow-notes').click();
    await page.keyboard.insertText(LONG_NOTES);
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
    const long = await geometry(page);
    const grown = long.fields.find((field) => field.id === 'flow-notes')!;
    expect(grown.control.height, 'long notes grow the field').toBeGreaterThan(notesBefore + 40);
    expect(grown.control.height).toBeLessThanOrEqual(320);
    // The rest of the panel keeps its measure; only the height changed.
    expect(Math.round(grown.control.width)).toBe(Math.round(notesField.control.width));
    await capture(page, `flow-fields-long-${theme}`, { golden: false });

    // Narrow viewport: the same single measure, nothing clipped or overlapping.
    await page.setViewportSize({ width: 720, height: 720 });
    const narrow = await geometry(page);
    const narrowWidths = narrow.fields.map((field) => Math.round(field.control.width));
    expect(new Set(narrowWidths).size, `narrow widths ${narrowWidths.join(',')}`).toBe(1);
    for (const field of narrow.fields) {
      expect(field.control.x).toBeGreaterThanOrEqual(0);
      expect(field.control.x + field.control.width).toBeLessThanOrEqual(720);
      expect(field.control.height).toBeGreaterThan(0);
    }
    await capture(page, `flow-fields-narrow-${theme}`, { golden: false });

    // A step's Description uses the same stacked layout.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('step-2').click();
    await expect(page.getByTestId('insp-description')).toBeVisible();
    const stepField = page.locator('[data-testid="insp-description"]').locator('xpath=ancestor::label[1]');
    await expect(stepField).toHaveClass(/flow-field-stacked/);
    await capture(page, `flow-fields-step-${theme}`, { golden: false });
  });
}
