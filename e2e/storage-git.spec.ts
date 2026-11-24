// SPDX-License-Identifier: GPL-3.0-only
// Real embedded-Git CLI + browser proof for commits, preview, restore, and reload.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startLocalWorkspaceServer } from './lib/localServer';
import { chooseAppMenu, openWorkspacePanels, setAppTheme } from './lib/panels';
import { seedCode } from './lib/seed';
import { capture } from './lib/screenshots';

interface GitVersion {
  id: string;
  message: string;
  savedAt: number;
}

async function versions(url: string): Promise<GitVersion[]> {
  const response = await fetch(`${url}/api/v1/workspace/history`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { versions: GitVersion[] }).versions;
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
}

test('server Git: content commits, historical preview, forward restore, and reload', async ({ page }) => {
  test.setTimeout(60_000);
  const server = await startLocalWorkspaceServer(-1, 'git');
  try {
    const file = join(server.directory, 'main.pcd');
    writeFileSync(file, 'pcd 1.0\nsystem shop "Before"\n');
    await page.goto(server.url);
    await openWorkspacePanels(page, ['sidebar', 'code']);
    await expect(page.getByTestId('workspace-storage')).toHaveText('Server storage: Git repository');
    await page.getByTestId('tree-row-main.pcd').locator('.tree-name').click();
    await seedCode(page, 'pcd 1.0\nsystem shop "First version"\n');
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('First version');
    await expect(page.getByTestId('status-pill')).toHaveText(/^Saved/);
    // Opening an external file can canonicalize it before the measured edit.
    // Track the actual user revisions rather than assuming an empty initial history.
    const afterFirst = await versions(server.url);
    const firstID = afterFirst[0]?.id;
    expect(firstID).toBeDefined();
    await seedCode(page, 'pcd 1.0\nsystem shop "Second version"\n');
    await expect.poll(async () => (await versions(server.url)).length).toBe(afterFirst.length + 1);

    await chooseAppMenu(page, 'tb-versions');
    await expect(page.getByRole('dialog', { name: 'Git version history' })).toBeVisible();
    await page.getByTestId(`version-select-${firstID}`).click();
    await expect(page.getByTestId('version-preview')).toContainText('main.pcd');
    await capture(page, 'storage-git-history-light', { golden: false });
    await axe(page);
    await page.getByTestId('version-restore').click();
    await expect(page.getByTestId('version-confirm')).toContainText('new commit');
    await page.getByTestId('version-confirm-restore').click();
    await expect(page.getByTestId('versions-overlay')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('First version');
    await expect.poll(async () => (await versions(server.url)).length).toBe(afterFirst.length + 2);
    expect(readFileSync(file, 'utf8')).toContain('First version');

    await page.reload();
    await openWorkspacePanels(page, ['sidebar', 'code']);
    await expect(page.locator('.cm-content')).toContainText('First version');
    await setAppTheme(page, 'dark');
    await chooseAppMenu(page, 'tb-versions');
    const latest = (await versions(server.url))[0];
    if (latest === undefined) throw new Error('restore commit missing from history');
    await page.getByTestId(`version-select-${latest.id}`).click();
    await expect(page.getByTestId('version-preview')).toContainText('main.pcd');
    await capture(page, 'storage-git-history-dark', { golden: false });
    await axe(page);
  } finally {
    await server.stop();
  }
});
