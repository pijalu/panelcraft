// SPDX-License-Identifier: GPL-3.0-only
// Regression for the reported blank-diagram path: the current elements are
// immediately presentable, and creating or customising a flow cannot erase them.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { documentText, seedCode } from './lib/seed';

async function blankDiagram(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await page.getByTestId('template-blank').click();
  await expect(page.getByTestId('template-gallery')).toHaveCount(0);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

async function drag(page: Page, kind: string, x: number, y: number): Promise<void> {
  const item = await page.getByTestId(kind).boundingBox();
  if (item === null) throw new Error(`${kind} has no box`);
  await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

test('blank person + container + link presents by default and New flow preserves the drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await blankDiagram(page);

  const canvas = page.getByTestId('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('canvas has no box');
  const person = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.32 };
  const container = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.32 };
  await drag(page, 'palette-person', person.x, person.y);
  await drag(page, 'palette-container', container.x, container.y);
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);

  await canvas.locator('g.pc-obj[data-id="o1"]').click();
  const halo = await canvas.locator('.pc-halo[data-side="right"]').first().boundingBox();
  const target = await canvas.locator('g.pc-obj[data-id="o2"]').boundingBox();
  if (halo === null || target === null) throw new Error('connection endpoints are unavailable');
  await page.mouse.move(halo.x + halo.width / 2, halo.y + halo.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');

  await page.getByTestId('present-open').click();
  await expect(page.getByTestId('launcher-title-default')).toHaveText('Default flow');
  await expect(page.getByTestId('launcher-meta-default')).toContainText('1 step');
  await capture(page, 'bugs-new-diagram-default-launcher-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'bugs-new-diagram-default-launcher-dark');
  await page.getByTestId('launcher-flow-default').press('Enter');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 1');
  await page.getByTestId('present-exit').click();

  await page.getByTestId('flow-add').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('flow-row-flow1')).toHaveText('New flow');
  await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
  const text = await documentText(page);
  expect(text).toContain('person o1 "Person 1"');
  expect(text).toContain('container o2 "Container 1"');
  expect(text).toContain('o1 -> o2');
  expect(text).toContain('flow "New flow" as flow1');
  expect(errors).toEqual([]);
});

test('a diagram with one unconnected element still presents a default process step', async ({ page }) => {
  await blankDiagram(page);
  await page.getByTestId('palette-person').click();
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(1);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.getByTestId('present-open').click();
  await expect(page.getByTestId('launcher-title-default')).toHaveText('Default flow');
  await expect(page.getByTestId('launcher-meta-default')).toContainText('1 step');
  await page.getByTestId('launcher-flow-default').click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 1');
  await expect(page.getByTestId('present-notes')).toContainText('Person 1');
});

test('editing Default creates a selected custom copy while Default follows later elements', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await seedCode(page, `pcd 1.0
person customer "Customer"
container shop "Shop"
customer -> shop : "buys"
`);
  await page.getByTestId('flow-row-default').click();
  await page.getByTestId('step-0').click();
  await expect(page.getByTestId('insp-label')).toHaveValue('buys');
  await expect(page.getByTestId('insp-label-inherited')).toBeVisible();
  await capture(page, 'bugs-new-diagram-default-inherited-light');
  await page.getByTestId('insp-description').focus();
  await page.keyboard.type('Custom narration', { delay: 50 });
  await expect(page.getByTestId('insp-description')).toHaveValue('Custom narration');
  await expect(page.getByTestId('flow-row-flow1')).toHaveText('Custom flow');
  await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('insp-label')).toHaveValue('buys');
  await capture(page, 'bugs-new-diagram-custom-copy-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'bugs-new-diagram-custom-copy-dark');

  await page.getByTestId('palette-queue').click();
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(3);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.getByTestId('flow-row-default').click();
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(2);
  await page.getByTestId('flow-row-flow1').click();
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(1);
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(3);
  await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(1);
});

test('typing into Default keeps focus when another custom flow already exists', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await seedCode(page, `pcd 1.0
person customer "Customer"
container shop "Shop"
customer -> shop : "buys"
flow "Existing" as flow1 {
  process customer
}
`);
  await page.getByTestId('flow-row-default').click();
  await page.getByTestId('step-0').click();
  await page.getByTestId('insp-description').focus();
  await page.keyboard.type('Order placed', { delay: 50 });
  await expect(page.getByTestId('insp-description')).toHaveValue('Order placed');
  await expect(page.getByTestId('flow-row-flow2')).toHaveText('Custom flow');
  await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
  await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(1);
});
