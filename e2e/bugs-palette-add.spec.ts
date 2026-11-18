// SPDX-License-Identifier: GPL-3.0-only
// Two defects in how a new element is created, both visible in the code view:
// one press on a palette item added the shape twice (the drag path and the click
// path both fired), and the default label was numbered from one counter shared
// by every kind, so a person added after a component was called "Person 2".
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0
title "palette"

layout saved
`;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page, ['code']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await seedCode(page, DOC);
}

async function documentText(page: Page): Promise<string> {
  return page.locator('.cm-content').innerText();
}

const countOf = (text: string, kind: string): number =>
  text.split('\n').filter((line) => line.trimStart().startsWith(`${kind} `)).length;

test('one palette click adds exactly one element', async ({ page }) => {
  await seed(page);
  await page.getByTestId('palette-container').click();
  // The code view is the source of truth: one press, one statement.
  await expect.poll(async () => countOf(await documentText(page), 'container')).toBe(1);
  await expect.poll(async () => countOf(await documentText(page), 'datastore')).toBe(0);
});

test('a palette drag adds exactly one element where it is dropped', async ({ page }) => {
  await seed(page);
  const item = page.getByTestId('palette-datastore');
  const box = (await item.boundingBox())!;
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => countOf(await documentText(page), 'datastore')).toBe(1);
  await expect.poll(async () => countOf(await documentText(page), 'container')).toBe(0);
});

test('default names number each kind from one', async ({ page }) => {
  await seed(page);
  // Two different kinds, added one press each: the label counter must be per
  // kind, so the second kind starts again at 1.
  await page.getByTestId('palette-container').click();
  await page.getByTestId('palette-component').click();
  await expect
    .poll(async () => await documentText(page), { timeout: 10_000 })
    .toContain('"Component 1"');
  const text = await documentText(page);
  expect(text).toContain('"Container 1"');
  expect(text).toContain('"Component 1"');
  expect(text).not.toContain('"Component 2"');
  expect(text).not.toContain('"Container 2"');
});
