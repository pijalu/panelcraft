// SPDX-License-Identifier: GPL-3.0-only
// Helpers for the hosted smoke suite: where the site is, which revision it must
// be, and where the retained evidence goes.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** The deployed site under test (a trailing slash keeps relative URLs correct). */
export const HOSTED_URL = (process.env.HOSTED_URL ?? 'https://pijalu.github.io/panelcraft/').replace(
  /\/?$/,
  '/',
);

/** The revision the release job means to publish; empty = accept any served SHA. */
export const EXPECTED_SHA = process.env.EXPECTED_BUILD_SHA ?? '';

/** Where the retained hosted evidence (screenshots, identity dumps) is written. */
export const EVIDENCE_DIR = 'test-results/hosted/screenshots';

export interface BuildInfo {
  schema: number;
  sha: string;
  shortSha: string;
  ref: string;
  builtAt: string;
  assets: Record<string, string>;
}

/** The deployment's own record of what it is — fetched past every cache. */
export async function servedBuildInfo(page: Page): Promise<BuildInfo> {
  const response = await page.request.get(`${HOSTED_URL}build-info.json?cb=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(response.ok(), `GET build-info.json → ${response.status()}`).toBe(true);
  return (await response.json()) as BuildInfo;
}

/** Open the deployed app and wait until the shell has booted. */
export async function openApp(page: Page): Promise<void> {
  await page.goto(HOSTED_URL);
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
}

/**
 * The page must be the revision this release job published: the meta tag the
 * build stamped and the deployment's own `build-info.json` must agree, and (when
 * the job names a SHA) both must name it. A deploy job going green is not this
 * check — it is the served page that is being asked.
 */
export async function expectServedIdentity(page: Page): Promise<BuildInfo> {
  const info = await servedBuildInfo(page);
  const stamped = await page.locator('meta[name="panelcraft-build"]').getAttribute('content');
  expect(stamped, 'index.html build meta tag').toBe(info.shortSha);
  expect(info.sha, 'served build sha length').toMatch(/^[0-9a-f]{40}$/);
  if (EXPECTED_SHA !== '') expect(info.sha, 'served revision').toBe(EXPECTED_SHA);
  return info;
}

/** Screenshot into the retained evidence directory (never the goldens). */
export async function shoot(page: Page, name: string, fullPage = true): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE_DIR, `${name}.png`), fullPage });
}

/** Every request the page made to another origin (must stay empty: no CDN). */
export async function watchOrigins(page: Page): Promise<string[]> {
  const foreign: string[] = [];
  const hosted = new URL(HOSTED_URL).origin;
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http')) return;
    const origin = new URL(url).origin;
    if (origin !== hosted) foreign.push(url);
  });
  return foreign;
}

/**
 * Content-only view of a document for round-trip comparison: CodeMirror's line
 * nodes carry their own newline, so blank lines would be counted twice, and the
 * comparison is about *what* the document holds, not its spacing.
 */
function normalise(text: string): string {
  return text
    .replace(/\u200b/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .join('\n');
}

/** Replace the code view's text and wait until the model round-trips it. */
export async function setDocument(page: Page, text: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  // A contenteditable `fill()` can lose the trailing lines when a re-render
  // lands mid-keystroke; typing into a select-all selection is atomic.
  await editor.click();
  // A select-all that misses the editor selects the page instead, the previous
  // document survives, and the scenario then measures a diagram it never
  // authored. Require the focus before trusting the chord.
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  // Assert the document actually holds what was typed: a silently truncated
  // document would make the following assertions test the wrong diagram.
  expect(normalise(await documentText(page)), 'document text').toBe(normalise(text));
}

/** The code view's text — i.e. exactly what a save would write. */
export async function documentText(page: Page): Promise<string> {
  return (await page.locator('.cm-content .cm-line').allInnerTexts()).join('\n');
}
