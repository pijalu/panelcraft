// SPDX-License-Identifier: GPL-3.0-only
// Bug review: an "Update available" banner was reported as stuck with
// unclickable controls. This spec measures the real browser hit test at both
// button centres in every shell state that could plausibly cover them, and
// asserts pointer/keyboard state changes rather than mere visibility. It stages
// a waiting worker by rewriting the served script, like e2e/ux08-pwa.spec.ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { chooseAppMenu, openWorkspacePanels, setAppTheme } from './lib/panels';
import { capture } from './lib/screenshots';
import { seedCode } from './lib/seed';

const FLOW_DOC = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send"
  conclusion "done"
}
`;

interface ElementInfo {
  tag: string;
  testId: string | null;
  className: string;
  text: string;
}

interface BannerStyle {
  tag: string;
  testId: string | null;
  display: string;
  visibility: string;
}

interface AncestorStyle extends ElementInfo {
  position: string;
  zIndex: string;
  pointerEvents: string;
  opacity: string;
  transform: string;
  filter: string;
  isolation: string;
  mixBlendMode: string;
  contain: string;
}

interface AncestorInfo extends AncestorStyle {
  stackingReasons: string[];
}

interface ButtonHit {
  box: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  pointerEvents: string;
  visibility: string;
  display: string;
  disabled: boolean | null;
  topElement: ElementInfo | null;
  hitIsButton: boolean;
  hitStack: ElementInfo[];
  ancestors: AncestorInfo[];
}

interface ShellState {
  presenting: string | null;
  panels: string | null;
  banner: { text: string; display: string; visibility: string; rendered: boolean; hiddenBy: string[] } | null;
  bannerCount: number;
  headerDisplay: string;
  modalTestIds: string[];
  playbar: boolean;
  theme: string | null;
  viewport: { width: number; height: number; dpr: number; pageScale: number; cssZoom: string };
}

interface WorkerState {
  controller: { state: string; scriptURL: string } | null;
  active: { state: string; scriptURL: string } | null;
  waiting: { state: string; scriptURL: string } | null;
  installing: { state: string; scriptURL: string } | null;
  scope: string | null;
}

interface Snapshot {
  state: string;
  shell: ShellState;
  worker: WorkerState;
  buttons: { restart: ButtonHit; later: ButtonHit };
  consoleErrors: string[];
}

const BUILT_WORKER = join('web', 'dist', 'sw.js');
const originalWorker = readFileSync(BUILT_WORKER, 'utf8');
let servedWorker = originalWorker;
let builds = 0;
const snapshots: Snapshot[] = [];
const consoleErrors: string[] = [];

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, FLOW_DOC);
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await page.waitForFunction(
    async () => {
      if (navigator.serviceWorker.controller === null) return false;
      return (await navigator.serviceWorker.getRegistration())?.active != null;
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function stageUpdate(page: Page): Promise<void> {
  builds += 1;
  servedWorker = `${servedWorker}\n// hit-test build ${builds}\n`;
  writeFileSync(BUILT_WORKER, servedWorker);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) throw new Error('no registration to update');
    await registration.update();
  });
}

async function shellState(page: Page): Promise<ShellState> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="app-shell"]');
    const banner = document.querySelector('[data-testid="banner-update"]');
    const header = document.querySelector('header.app-header');
    const modalIds = ['clear-dialog', 'present-launcher-backdrop', 'search-overlay', 'drawer-backdrop'];
    return {
      presenting: shell?.getAttribute('data-presenting') ?? null,
      panels: shell?.getAttribute('data-panels') ?? null,
      banner: banner === null ? null : {
        text: banner.textContent?.trim().slice(0, 160) ?? '',
        display: getComputedStyle(banner).display,
        visibility: getComputedStyle(banner).visibility,
        rendered: banner.getClientRects().length > 0,
        hiddenBy: [],
      },
      bannerCount: document.querySelectorAll('[data-testid="banner-update"]').length,
      headerDisplay: header === null ? 'absent' : getComputedStyle(header).display,
      modalTestIds: modalIds.filter((id) => document.querySelector(`[data-testid="${id}"]`) !== null),
      playbar: document.querySelector('[data-testid="playbar"]') !== null,
      theme: document.documentElement.getAttribute('data-theme'),
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        pageScale: visualViewport?.scale ?? 1,
        cssZoom: getComputedStyle(document.documentElement).zoom,
      },
    };
  });
}

async function bannerStyles(page: Page): Promise<BannerStyle[]> {
  return page.evaluate(() => {
    const banner = document.querySelector('[data-testid="banner-update"]');
    const steps: {
      tag: string; testId: string | null; display: string; visibility: string;
    }[] = [];
    for (let node: Element | null = banner; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      steps.push({
        tag: node.tagName.toLowerCase(),
        testId: node.getAttribute('data-testid'),
        display: style.display,
        visibility: style.visibility,
      });
    }
    return steps;
  });
}

async function workerState(page: Page): Promise<WorkerState> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const info = (worker: ServiceWorker | null) => worker === null ? null : {
      state: worker.state,
      scriptURL: worker.scriptURL,
    };
    return {
      controller: info(navigator.serviceWorker.controller),
      active: info(registration?.active ?? null),
      waiting: info(registration?.waiting ?? null),
      installing: info(registration?.installing ?? null),
      scope: registration?.scope ?? null,
    };
  });
}

function stackingReasons(style: AncestorStyle): string[] {
  const reasons: string[] = [];
  if (style.position !== 'static' && style.zIndex !== 'auto') reasons.push(`${style.position} z-index ${style.zIndex}`);
  if (Number(style.opacity) < 1) reasons.push(`opacity ${style.opacity}`);
  if (style.transform !== 'none') reasons.push('transform');
  if (style.filter !== 'none') reasons.push('filter');
  if (style.isolation === 'isolate') reasons.push('isolation');
  if (style.mixBlendMode !== 'normal') reasons.push('blend mode');
  if (style.contain.includes('paint')) reasons.push('paint containment');
  return reasons;
}

async function ancestorStyles(page: Page, testId: string): Promise<AncestorStyle[]> {
  return page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`);
    const rows: {
      tag: string; testId: string | null; className: string; text: string;
      position: string; zIndex: string; pointerEvents: string; opacity: string;
      transform: string; filter: string; isolation: string; mixBlendMode: string; contain: string;
    }[] = [];
    for (let node: Element | null = button; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      rows.push({
        tag: node.tagName.toLowerCase(),
        testId: node.getAttribute('data-testid'),
        className: typeof node.className === 'string' ? node.className : '',
        text: (node.textContent ?? '').trim().slice(0, 60),
        position: style.position,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        opacity: style.opacity,
        transform: style.transform,
        filter: style.filter,
        isolation: style.isolation,
        mixBlendMode: style.mixBlendMode,
        contain: style.contain,
      });
    }
    return rows;
  }, testId);
}

async function buttonHit(page: Page, testId: string): Promise<ButtonHit> {
  const ancestors = (await ancestorStyles(page, testId)).map((style) => ({
    ...style,
    stackingReasons: stackingReasons(style),
  }));
  return page.evaluate((input: { id: string; ancestors: AncestorInfo[] }) => {
    const { id, ancestors } = input;
    const describe = (element: Element | null): ElementInfo | null => element === null ? null : {
      tag: element.tagName.toLowerCase(),
      testId: element.getAttribute('data-testid'),
      className: typeof element.className === 'string' ? element.className : '',
      text: (element.textContent ?? '').trim().slice(0, 60),
    };
    const button = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (button === null) throw new Error(`missing button ${id}`);
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const style = getComputedStyle(button);
    return {
      box: { x: r.left, y: r.top, width: r.width, height: r.height },
      center: { x, y },
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      display: style.display,
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      topElement: describe(top),
      hitIsButton: top !== null && (top === button || button.contains(top)),
      hitStack: document.elementsFromPoint(x, y).slice(0, 8).map((element) => describe(element)!),
      ancestors,
    };
  }, { id: testId, ancestors });
}

async function record(
  page: Page,
  state: string,
  screenshot?: string,
  expectButtons = false,
  expectHidden = false,
): Promise<Snapshot> {
  const snapshot: Snapshot = {
    state,
    shell: await shellState(page),
    worker: await workerState(page),
    buttons: {
      restart: await buttonHit(page, 'update-restart'),
      later: await buttonHit(page, 'update-later'),
    },
    consoleErrors: [...consoleErrors],
  };
  const styles = await bannerStyles(page);
  const hiddenBy = styles
    .filter((style) => style.display === 'none' || style.visibility === 'hidden')
    .map((style) => `${style.tag}${style.testId === null ? '' : `#${style.testId}`}:${style.display}/${style.visibility}`);
  if (snapshot.shell.banner !== null) snapshot.shell.banner.hiddenBy = hiddenBy;
  snapshots.push(snapshot);
  if (screenshot !== undefined) await capture(page, screenshot, { golden: false });
  if (expectHidden) {
    expect.soft(
      snapshot.shell.banner === null || snapshot.shell.banner.rendered === false,
      `${state}: update banner not rendered`,
    ).toBe(true);
  }
  if (expectButtons) {
    expect.soft(snapshot.shell.banner, `${state}: update banner exists`).not.toBeNull();
    expect.soft(snapshot.buttons.restart.hitIsButton, `${state}: Restart centre hit`).toBe(true);
    expect.soft(snapshot.buttons.later.hitIsButton, `${state}: Later centre hit`).toBe(true);
  }
  return snapshot;
}

async function centreClick(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  if (box === null) throw new Error(`no box for ${testId}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe.configure({ mode: 'serial' });

test('update banner hit test across shell states', async ({ page, context }) => {
  test.setTimeout(180_000);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  try {
    await ready(page);
    await seedDoc(page);
    await stageUpdate(page);
    const banner = page.getByTestId('banner-update');
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await record(page, 'baseline-light', 'update-hit-baseline-light', true);
    await setAppTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await record(page, 'baseline-dark', 'update-hit-baseline-dark', true);
    await setAppTheme(page, 'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');

    // Unapplied code changes the offer's copy and makes Restart a confirmed
    // consent; its hit surface must stay the same.
    await seedCode(page, 'pcd 1.0\nsystem', { sync: 'error' });
    await expect(banner).toContainText('Unapplied code');
    await record(page, 'unapplied-confirmation', 'update-hit-unapplied', true);
    await seedCode(page, FLOW_DOC);

    await page.setViewportSize({ width: 375, height: 667 });
    await record(page, 'narrow', 'update-hit-narrow', true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(async () => page.getByTestId('drawer-backdrop').count(), { timeout: 5000 })
      .toBe(0);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await record(page, 'zoom-200', 'update-hit-zoom', true);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

    await page.getByTestId('app-menu').click();
    await record(page, 'menu', 'update-hit-menu');
    await page.keyboard.press('Escape');
    await chooseAppMenu(page, 'tb-clear-data');
    await expect(page.getByTestId('clear-dialog')).toBeVisible();
    await record(page, 'modal', 'update-hit-modal');
    await page.getByTestId('clear-cancel').click();

    await page.getByTestId('present-open').click();
    await expect(page.getByTestId('present-launcher')).toBeVisible();
    await record(page, 'launcher-modal', 'update-hit-launcher');
    await page.getByTestId('launcher-flow-main').click();
    await expect(page.getByTestId('present-dock')).toBeVisible();
    // Presentation hides editor chrome; an update offer is queued, not a
    // visible control under the transparent advance overlay.
    await record(page, 'presentation', 'update-hit-presentation', false, true);
    await page.getByTestId('present-toggle').click();
    await record(page, 'presentation-paused', 'update-hit-presentation-paused', false, true);
    await page.getByTestId('present-exit').click();
    await expect(banner).toBeVisible();

    // Drop the presentation anchor so a reload exercises the ordinary shell,
    // not the URL-driven presentation adopted on load.
    await page.evaluate(() => history.replaceState(null, '', location.pathname + location.search));
    await page.reload();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await record(page, 'after-reload', 'update-hit-reload', true);

    await page.getByTestId('update-later').focus();
    await page.keyboard.press('Enter');
    await expect(banner).toHaveCount(0);
    await stageUpdate(page);
    await expect(banner).toBeVisible({ timeout: 15_000 });
    const countBefore = navigations.length;
    await centreClick(page, 'update-restart');
    await expect.poll(() => navigations.length, { timeout: 15_000 }).toBe(countBefore + 1);
  } finally {
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', 'update-banner-hit-test.json'), `${JSON.stringify(snapshots, null, 2)}\n`);
  }
});

test.afterAll(() => {
  writeFileSync(BUILT_WORKER, originalWorker);
});
