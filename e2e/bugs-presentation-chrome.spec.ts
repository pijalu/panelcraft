// SPDX-License-Identifier: GPL-3.0-only
// Presentation is a read-only view: selecting an element before starting a flow
// must not leave editing outlines or resize handles bouncing with the camera.
// The same filmstrip guards authored item names in every shipped template after
// insertion, reload, Properties, Flow Steps, presentation, and exit.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

interface TemplateCase {
  id: 'c4' | 'flow' | 'mermaid';
  flowKey: 'default' | 'checkout';
  objects: ReadonlyArray<{ id: string; kind: string; name: string }>;
  steps: readonly string[];
  firstNarration: string;
}

const CASES: readonly TemplateCase[] = [
  {
    id: 'c4',
    flowKey: 'default',
    objects: [
      { id: 'user', kind: 'person', name: 'Customer' },
      { id: 'app', kind: 'system', name: 'Shop' },
      { id: 'pay', kind: 'system ext', name: 'Payment provider' },
    ],
    steps: ['buys', 'charges'],
    firstNarration: 'buys',
  },
  {
    id: 'flow',
    flowKey: 'checkout',
    objects: [
      { id: 'web', kind: 'system', name: 'Web app' },
      { id: 'api', kind: 'system', name: 'API' },
    ],
    steps: ['POST /checkout', '201 Created'],
    firstNarration: 'POST /checkout',
  },
  {
    id: 'mermaid',
    flowKey: 'default',
    objects: [
      { id: 'a', kind: 'system', name: 'Service A' },
      { id: 'b', kind: 'system', name: 'Service B' },
    ],
    steps: ['Service A → Service B'],
    firstNarration: 'Service A → Service B',
  },
];

async function expectObjectNames(page: Page, testCase: TemplateCase): Promise<void> {
  await expect(page.locator('.pc-obj')).toHaveCount(testCase.objects.length);
  for (const item of testCase.objects) {
    const object = page.locator(`.pc-obj[data-id="${item.id}"]`);
    await expect(object).toHaveAttribute('aria-label', `${item.kind} ${item.name}`);
    await expect(object.locator('.pc-label')).toHaveText(item.name);
  }
}

for (const testCase of CASES) {
  test(`${testCase.id}: names survive and presentation hides only editing chrome`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByTestId(`template-${testCase.id}`).click();
    await expectObjectNames(page, testCase);

    await page.reload();
    await expectObjectNames(page, testCase);
    await openWorkspacePanels(page, ['props']);
    for (const item of testCase.objects) {
      await page.locator(`.pc-obj[data-id="${item.id}"]`).click();
      await expect(page.getByTestId('prop-name')).toHaveValue(item.name);
    }
    await openWorkspacePanels(page, ['flows']);
    for (let index = 0; index < testCase.steps.length; index++) {
      const row = page.getByTestId(`step-${index}`);
      if (testCase.id === 'mermaid') {
        await expect(page.getByTestId(`step-summary-${index}`)).toHaveText(testCase.steps[index]!);
      } else {
        await expect(page.getByTestId(`step-title-${index}`)).toHaveText(testCase.steps[index]!);
      }
      await expect(row).not.toHaveText(/undefined|null/);
    }

    const selectedId = testCase.objects[0]!.id;
    await page.locator(`.pc-obj[data-id="${selectedId}"]`).click();
    await expect(page.locator(`.pc-obj[data-id="${selectedId}"]`)).toHaveClass(/pc-selected/);
    await expect(page.locator('.pc-resize-handle')).toHaveCount(8);
    await page.getByTestId('present-open').click();
    await page.getByTestId(`launcher-flow-${testCase.flowKey}`).click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
    await expect(page.getByTestId('present-notes')).toContainText(testCase.firstNarration);
    await expect(page.locator('.pc-anim-layer .pc-badge')).toBeVisible();

    for (const sample of [0, 1]) {
      if (sample === 1) await page.waitForTimeout(450);
      await expect(page.locator('.pc-selected, .pc-link-selected')).toHaveCount(0);
      await expect(page.locator('.pc-layer-overlay > *')).toHaveCount(0);
      await expect(page.locator('.pc-resize-handle, .pc-halo, .pc-waypoint, .pc-segment')).toHaveCount(0);
      await expectObjectNames(page, testCase);
    }
    await capture(page, `bugs-presentation-${testCase.id}-light`);
    await page.emulateMedia({ colorScheme: 'dark' });
    await capture(page, `bugs-presentation-${testCase.id}-dark`);

    await page.getByTestId('present-exit').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
    await expect(page.locator(`.pc-obj[data-id="${selectedId}"]`)).toHaveClass(/pc-selected/);
    await expect(page.locator('.pc-resize-handle')).toHaveCount(8);
    await expectObjectNames(page, testCase);
  });
}
