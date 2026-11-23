// SPDX-License-Identifier: GPL-3.0-only
// Regression for the reported blank-diagram path: the current elements are
// immediately presentable, and creating or customising a flow cannot erase them.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { documentText, seedCode } from './lib/seed';
import { parsePDL } from '../web/src/engine/format/parser';
import { buildPlan } from '../web/src/engine/flows/plan';
import { derivedFlow } from '../web/src/ui/flows/derivedFlow';

async function blankDiagram(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows', 'palette']);
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

/** Real spark translation in layer coordinates, independent of camera refits. */
async function sparkPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.getByTestId('canvas').locator('[data-role="spark"]').first().evaluate((el) => {
    const transform = getComputedStyle(el).transform;
    const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
}

test('blank person + component + link presents by default and New flow preserves the drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await blankDiagram(page);

  const canvas = page.getByTestId('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('canvas has no box');
  const person = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.32 };
  const component = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.32 };
  await drag(page, 'palette-person', person.x, person.y);
  await drag(page, 'palette-component', component.x, component.y);
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

  // The reported path labels the new connector and presents immediately.
  await canvas.locator('g.pc-link path.pc-route').dblclick({ force: true });
  await page.getByTestId('link-label').fill('test');
  await expect(page.getByTestId('link-label')).toHaveValue('test');
  const sourceAtLaunch = await documentText(page);
  const sourceDoc = parsePDL(sourceAtLaunch).doc!;
  const sourceFlow = derivedFlow(sourceDoc)!;
  const sourcePlan = buildPlan({ doc: sourceDoc, flow: sourceFlow });

  await page.getByTestId('present-open').click();
  await expect(page.getByTestId('launcher-title-default')).toHaveText('Default flow');
  await expect(page.getByTestId('launcher-meta-default')).toContainText('1 step');
  await capture(page, 'bugs-new-diagram-default-launcher-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'bugs-new-diagram-default-launcher-dark');
  await page.getByTestId('launcher-flow-default').press('Enter');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
  await test.info().attach('default-playback-source-and-plan', {
    contentType: 'application/json',
    body: JSON.stringify({
      codeSourceAtLaunch: sourceAtLaunch,
      derivedStepsFromCode: sourceFlow.steps,
      planFromCode: sourcePlan.beats.map((beat) => ({ title: beat.title, links: beat.links })),
      counter: await page.getByTestId('present-counter').innerText(),
      narration: await page.getByTestId('present-notes').innerText(),
      sparks: await canvas.locator('[data-role="spark"]').count(),
    }, null, 2),
  });
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 1');
  await expect(page.getByTestId('present-notes')).toHaveText('test');
  const spark = canvas.locator('[data-role="spark"]').first();
  await expect(spark).toHaveCount(1);
  await expect.poll(() => spark.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
  const sparkStart = await sparkPoint(page);
  await capture(page, 'bugs-default-playback-spark-early-dark', { golden: false });
  await expect.poll(async () => {
    const next = await sparkPoint(page);
    return Math.hypot(next.x - sparkStart.x, next.y - sparkStart.y);
  }).toBeGreaterThan(2);
  await capture(page, 'bugs-default-playback-spark-moving-dark', { golden: false });
  await page.emulateMedia({ colorScheme: 'light' });
  await capture(page, 'bugs-default-playback-spark-moving-light', { golden: false });
  await page.getByTestId('present-toggle').click();
  await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');
  await page.getByTestId('present-exit').click();

  // Reduced motion keeps the same truthful step and narration, but parks the
  // arrival token without a travelling spark, trail or WAAPI animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('present-open').click();
  await page.getByTestId('launcher-flow-default').click();
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 1');
  await expect(page.getByTestId('present-notes')).toHaveText('test');
  const settled = canvas.locator('.pc-token-static');
  await expect(settled).toHaveCount(1);
  await expect(settled).toBeVisible();
  expect(await settled.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(canvas.locator('[data-role="spark"]')).toHaveCount(0);
  await expect(canvas.locator('.pc-trail')).toHaveCount(0);
  // The token itself has no animation. Let the presentation's scheduled camera
  // refit finish before comparing its painted position in screen coordinates.
  await page.waitForTimeout(350);
  const settledStart = await settled.boundingBox();
  await page.waitForTimeout(120);
  expect(await settled.boundingBox()).toEqual(settledStart);
  await capture(page, 'bugs-default-playback-reduced-light', { golden: false });
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'bugs-default-playback-reduced-dark', { golden: false });
  await page.getByTestId('present-exit').click();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });

  await page.getByTestId('flow-add').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('flow-row-flow1')).toHaveText('New flow');
  await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
  const text = await documentText(page);
  expect(text).toContain('person o1 "Person 1"');
  expect(text).toContain('component o2 "Component 1"');
  expect(text).toContain('o1 -> o2');
  expect(text).toContain('flow "New flow" as flow1');
  expect(errors).toEqual([]);
});

test('blank and populated diagrams always offer Default flow', async ({ page }) => {
  await blankDiagram(page);
  const blankText = await documentText(page);
  await page.getByTestId('present-open').click();
  await expect(page.getByTestId('launcher-title-default')).toHaveText('Default flow');
  await expect(page.getByTestId('launcher-meta-default')).toContainText('0 steps');
  await expect(page.getByTestId('launcher-empty')).toHaveCount(0);
  await capture(page, 'bugs-new-diagram-blank-launcher-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'bugs-new-diagram-blank-launcher-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.keyboard.press('Escape');
  expect(await documentText(page)).toBe(blankText);
  expect(blankText).not.toContain('flow ');

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
  await openWorkspacePanels(page, ['code', 'flows', 'palette']);
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

test('a reordered custom flow keeps its details while Default follows later drawing edits', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows', 'palette']);
  await seedCode(page, `pcd 1.0
person customer "Customer"
container shop "Shop"
system_ext payment "Payment"
customer -> shop : "buys"
shop -> payment : "charges"
`);

  await page.getByTestId('flow-row-default').click();
  await page.getByTestId('step-0').click();
  await page.getByTestId('step-down').click();
  await expect(page.getByTestId('flow-row-flow1')).toHaveText('Custom flow');
  await page.getByTestId('step-0').click();
  await expect(page.getByTestId('step-title-0')).toHaveText('charges');
  await page.getByTestId('insp-label').fill('Custom charge');
  await page.getByTestId('insp-description').fill('Authored detail');
  await expect(page.getByTestId('insp-description')).toHaveValue('Authored detail');

  // Later drawing work changes only the live Default. The authored flow keeps
  // its reverse order, explicit label and description.
  await page.getByTestId('palette-queue').click();
  await page.getByTestId('flow-row-default').click();
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('step-title-0')).toHaveText('buys');
  await expect(page.getByTestId('step-title-1')).toHaveText('charges');
  await expect(page.getByTestId('step-title-2')).toHaveText('Queue 1');
  await page.getByTestId('flow-row-flow1').click();
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('step-title-0')).toHaveText('Custom charge');
  await expect(page.getByTestId('step-title-1')).toHaveText('buys');
  await page.getByTestId('step-0').click();
  await expect(page.getByTestId('insp-description')).toHaveValue('Authored detail');

  await page.getByTestId('present-open').click();
  await expect(page.getByTestId('launcher-meta-default')).toContainText('3 steps');
  await expect(page.getByTestId('launcher-meta-flow1')).toContainText('2 steps');
  await page.getByTestId('launcher-flow-flow1').click();
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 2');
  await expect(page.getByTestId('present-notes')).toHaveText('Custom charge');
  await expect(page.getByTestId('canvas').locator('[data-role="spark"]')).toHaveCount(1);
  await page.getByTestId('present-next').click();
  await expect(page.getByTestId('present-counter')).toHaveText('2 / 2');
  await expect(page.getByTestId('present-notes')).toHaveText('buys');
  await page.getByTestId('present-exit').click();

  await page.getByTestId('present-open').click();
  await page.getByTestId('launcher-flow-default').click();
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 3');
  await expect(page.getByTestId('present-notes')).toHaveText('buys');
  await page.getByTestId('present-next').click();
  await expect(page.getByTestId('present-notes')).toHaveText('charges');
  await page.getByTestId('present-next').click();
  await expect(page.getByTestId('present-counter')).toHaveText('3 / 3');
  await expect(page.getByTestId('present-notes')).toHaveText('Queue 1');
  await page.getByTestId('present-exit').click();

  const text = await documentText(page);
  expect(text.match(/^flow /gm)).toHaveLength(1);
  expect(text).toContain('flow "Custom flow" as flow1');
  expect(text).not.toContain('flow "Default flow"');
});

test('typing into Default keeps focus when another custom flow already exists', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows', 'palette']);
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

const STARTERS = [
  { id: 'blank', links: 0, titles: [], summaries: [] },
  { id: 'c4', links: 2, titles: ['buys', 'charges'], summaries: ['Customer → Shop', 'Shop → Payment provider'] },
  { id: 'flow', links: 2, titles: ['POST /checkout', '201 Created'], summaries: ['Web app → API', 'API → Web app'] },
  { id: 'mermaid', links: 1, titles: [], summaries: ['Service A → Service B'] },
] as const;

for (const starter of STARTERS) {
  test(`new ${starter.id} file opens Default with its expected drawn steps`, async ({ page }) => {
    await page.goto('/');
    await openWorkspacePanels(page, ['code', 'flows']);
    await page.getByTestId(`template-${starter.id}`).click();
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');

    await expect(page.getByTestId('flow-list').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('flow-row-default')).toBeVisible();
    await expect(page.getByTestId('flow-derived-hint')).toBeVisible();
    await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(starter.titles.length || starter.summaries.length);
    await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(starter.links);
    for (const [index, title] of starter.titles.entries()) {
      await expect(page.getByTestId(`step-title-${index}`)).toHaveText(title);
    }
    for (const [index, summary] of starter.summaries.entries()) {
      await expect(page.getByTestId(`step-summary-${index}`)).toHaveText(summary);
    }

    if (starter.id === 'flow') {
      await capture(page, 'bugs-new-diagram-flow-template-light');
      await page.emulateMedia({ colorScheme: 'dark' });
      await capture(page, 'bugs-new-diagram-flow-template-dark');
      await page.emulateMedia({ colorScheme: 'light' });
    }
    await page.getByTestId('present-open').click();
    await expect(page.getByTestId('launcher-list').locator('li')).toHaveCount(1);
    const count = starter.titles.length || starter.summaries.length;
    await expect(page.getByTestId('launcher-meta-default')).toContainText(`${count} ${count === 1 ? 'step' : 'steps'}`);
  });
}
