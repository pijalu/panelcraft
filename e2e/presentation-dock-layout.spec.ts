// SPDX-License-Identifier: GPL-3.0-only
// Presentation dock layout regression: the fixed 96px reservation must become
// the measured height of the complete dock, including wrapped content and the
// safe area. Browser geometry is authoritative here; jsdom has no layout.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const LONG_NARRATION =
  'This deliberately long active-step narration wraps across many lines so the complete presentation dock grows beyond the old fixed reservation while the component and its connector label must remain visible.';
const LONG_DESCRIPTION =
  'The active step explanation also wraps beside the drawing. Its separate common region must stay clear of the canvas, narration, progress and transport controls.';

const DOC = `pcd 1.0
direction TB
layout saved
position person1 (80, 40)
position component1 (80, 400)

person person1 "Person 1"
component component1 "Component 1"
person1 -> component1 : "test" as test

flow "Dock clipping" as main {
  intro "${LONG_NARRATION}" delay 10000
  process component1 "Active component" delay 10000
}
`;

const extraSteps = Array.from(
  { length: 62 },
  (_, index) => `  process component1 "Step ${index + 3}" delay 10000`,
).join('\n');
const FILMSTRIP_DOC = `pcd 1.0
direction TB
layout saved
position person1 (80, 40)
position component1 (80, 400)

person person1 "Person 1"
component component1 "Component 1"
person1 -> component1 : "test" as test

flow "Dock filmstrip" as main {
  person1 -> component1 : "${LONG_NARRATION}" delay 10000 presentation {
    description "${LONG_DESCRIPTION}"
    camera auto
    duration 0
  }
  process component1 "${LONG_NARRATION}" delay 10000 presentation {
    description "${LONG_DESCRIPTION}"
    camera auto
    duration 0
  }
${extraSteps}
}
`;

const REFIT_DOC = `pcd 1.0
person person1 "Person 1"
component component1 "Component 1"
person1 -> component1 : "test" as test
flow "Safe area" as main {
  process component1 "Camera target" delay 10000 presentation {
    camera auto
    duration 0
  }
}
`;

const CHOICE_DOC = `pcd 1.0
person person1 "Person 1"
component component1 "Component 1"
person1 -> component1 : "test" as test
flow "Choices" as main {
  process component1 "Before the choice" delay 10000
  alt "${LONG_NARRATION}" {
    "Take the carefully explained upper route with a wrapped choice label" { process component1 "Upper" }
    "Take the other carefully explained route with another wrapped label" { process person1 "Lower" }
  }
}
`;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface PresentationBounds {
  canvas: Box;
  dock: Box;
  advance: Box;
  narration: Box;
  component: Box;
  person: Box;
  connectorLabel: Box;
  description: Box | null;
  controls: Box[];
  dots: Box[];
  choices: Box[];
  dockPaddingBottom: number;
  viewportHeight: number;
  viewportWidth: number;
  documentWidth: number;
}

async function bounds(page: Page): Promise<PresentationBounds> {
  return page.evaluate(() => {
    const read = (selector: string): Box => {
      const el = document.querySelector(selector);
      if (el === null) throw new Error(`Missing layout element: ${selector}`);
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const readAll = (selector: string): Box[] =>
      Array.from(document.querySelectorAll(selector), (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
    const dock = document.querySelector('[data-testid="present-dock"]');
    const description = document.querySelector('[data-testid="step-explanation"]');
    return {
      canvas: read('[data-testid="canvas"]'),
      dock: read('[data-testid="present-dock"]'),
      advance: read('[data-testid="present-advance"]'),
      narration: read('[data-testid="present-notes"]'),
      component: read('.pc-obj[data-id="component1"]'),
      person: read('.pc-obj[data-id="person1"]'),
      connectorLabel: read('.pc-link-label-group[data-id="test"]'),
      description: description === null ? null : read('[data-testid="step-explanation"]'),
      controls: readAll('.present-row button, .present-framing-open'),
      dots: readAll('.present-dot'),
      choices: readAll('[data-testid="present-choices"] button'),
      dockPaddingBottom: dock === null ? 0 : Number.parseFloat(getComputedStyle(dock).paddingBottom),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
}

async function seed(page: Page, source: string = DOC): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  await expect(page.locator('.cm-content')).toContainText('pcd 1.0');
  await seedCode(page, source);
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
}

async function present(page: Page): Promise<void> {
  await page.getByTestId('flow-play-main').click();
  await page.getByTestId('pb-present').click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
  await expect(page.getByTestId('present-dock')).toBeVisible();
}

function expectInside(child: Box, parent: Box, label: string): void {
  expect(child.left, `${label} left`).toBeGreaterThanOrEqual(parent.left - 1);
  expect(child.right, `${label} right`).toBeLessThanOrEqual(parent.right + 1);
  expect(child.top, `${label} top`).toBeGreaterThanOrEqual(parent.top - 1);
  expect(child.bottom, `${label} bottom`).toBeLessThanOrEqual(parent.bottom + 1);
}

function expectLayout(measured: PresentationBounds, active: 'message' | 'component'): void {
  expect(Math.abs(measured.canvas.bottom - measured.dock.top), 'canvas ends at dock top').toBeLessThanOrEqual(1);
  expect(Math.abs(measured.advance.bottom - measured.dock.top), 'advance ends at dock top').toBeLessThanOrEqual(1);
  expectInside(measured.narration, measured.dock, 'narration');
  expect(measured.dock.bottom).toBeLessThanOrEqual(measured.viewportHeight + 1);
  expect(measured.documentWidth, 'no horizontally clipped presentation content').toBeLessThanOrEqual(measured.viewportWidth);
  measured.controls.forEach((box, index) => expectInside(box, measured.dock, `control ${index}`));
  measured.dots.forEach((box, index) => expectInside(box, measured.dock, `dot ${index}`));
  measured.choices.forEach((box, index) => expectInside(box, measured.dock, `choice ${index}`));
  const activeBoxes = active === 'message'
    ? [measured.person, measured.component, measured.connectorLabel]
    : [measured.component];
  activeBoxes.forEach((box, index) => expectInside(box, measured.canvas, `active content ${index}`));
  if (measured.description !== null && measured.canvas.top > 0) {
    expect(measured.description.bottom, 'description stays above its narrow canvas reservation').toBeLessThanOrEqual(measured.canvas.top);
  }
}

async function captureState(page: Page, name: string, active: 'message' | 'component'): Promise<void> {
  await expect.poll(async () => {
    const b = await bounds(page);
    return Math.abs(b.canvas.bottom - b.dock.top);
  }, { timeout: 5000 }).toBeLessThanOrEqual(1);
  await page.waitForTimeout(100);
  const measured = await bounds(page);
  expectLayout(measured, active);
  await test.info().attach(`${name}-bounds`, {
    body: JSON.stringify(measured, null, 2),
    contentType: 'application/json',
  });
  await capture(page, name, { golden: false });
}

test('wrapped narration reserves the real dock height and keeps the active drawing visible', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await seed(page);
  await present(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await expect(page.getByTestId('present-notes')).toHaveText(LONG_NARRATION);
  // The optional framing popover is a separate, dismissible layer. Close it
  // so this capture isolates dock occlusion instead of hiding the component
  // behind an intentional explanation surface.
  await page.getByTestId('framing-popover-close').click();
  await expect(page.getByTestId('framing-popover')).toHaveCount(0);
  await page.waitForTimeout(350);

  const measured = await bounds(page);
  console.log('PRESENT_DOCK_MEASURED', JSON.stringify(measured));
  expectLayout(measured, 'message');
  await capture(page, 'presentation-dock-active-drawing-narrow-dark', { golden: false });
});

for (const theme of ['light', 'dark'] as const) {
  test(`initial, playing, paused and settled frames share the measured inset (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await seed(page, FILMSTRIP_DOC);
    await page.setViewportSize({ width: 360, height: 740 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 0, left: 0, bottom: 24, right: 0 },
    });

    // A query forces a real document load at the narrow size. Restored storage
    // and the hash start playback without relying on editor controls hidden at
    // the narrow breakpoint.
    await page.goto(`/?dock-filmstrip=${theme}#present=main`);
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'playing');
    await expect(page.getByTestId('present-counter')).toHaveText('1 / 64');
    await expect(page.getByTestId('present-notes')).toHaveText(LONG_NARRATION);
    await expect(page.getByTestId('step-explanation')).toContainText(LONG_DESCRIPTION);
    await expect(page.locator('.present-dot')).toHaveCount(64);
    await captureState(page, `presentation-dock-initial-${theme}`, 'message');
    expect((await bounds(page)).dockPaddingBottom).toBe(32);
    expect((await page.getByTestId('present-dots').boundingBox())!.height).toBeGreaterThan(10);

    await page.getByTestId('present-toggle').click();
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');
    await captureState(page, `presentation-dock-paused-${theme}`, 'message');

    // Progress-dot navigation parks the beat and settles its animation. Step 2
    // keeps the same wrapped narration and description while changing camera
    // targets, so the filmstrip also covers dock-size-preserving refits.
    await page.getByTestId('present-dot-2').click();
    await expect(page.getByTestId('present-counter')).toHaveText('2 / 64');
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');
    await captureState(page, `presentation-dock-settled-${theme}`, 'component');

    await page.getByTestId('present-toggle').click();
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'playing');
    await captureState(page, `presentation-dock-playing-${theme}`, 'component');
  });
}

test('safe-area dock growth updates both surfaces and refits the current camera', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await seed(page, REFIT_DOC);
  await present(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 0, left: 0, bottom: 0, right: 0 },
  });
  await captureState(page, 'presentation-dock-safe-area-zero-light', 'component');
  const before = await bounds(page);
  const transform = await page.locator('.pc-world').getAttribute('transform');

  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 0, left: 0, bottom: 32, right: 0 },
  });
  await expect.poll(async () => (await bounds(page)).dock.height).toBe(before.dock.height + 32);
  await expect.poll(async () => page.locator('.pc-world').getAttribute('transform')).not.toBe(transform);
  await captureState(page, 'presentation-dock-safe-area-grown-light', 'component');
  const after = await bounds(page);
  expect(after.canvas.height).toBe(before.canvas.height - 32);
  expect(after.dockPaddingBottom).toBe(40);
});

test('wrapped choices and narration stay reachable above the narrow canvas', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await seed(page, CHOICE_DOC);
  await present(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByTestId('present-dot-2').click();
  await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');
  await expect(page.getByTestId('present-choices').getByRole('button')).toHaveCount(2);
  await captureState(page, 'presentation-dock-wrapped-choices-narrow-dark', 'component');
  const measured = await bounds(page);
  expect(measured.choices.some((box) => box.height > 32), 'a choice label actually wrapped').toBe(true);
});
