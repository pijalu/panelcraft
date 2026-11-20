// SPDX-License-Identifier: GPL-3.0-only
// Real CLI + browser proof for confined, revision-checked filesystem storage.
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startLocalWorkspaceServer } from './lib/localServer';
import { openWorkspacePanels, setAppTheme, chooseAppMenu } from './lib/panels';
import { seedCode } from './lib/seed';
import { capture } from './lib/screenshots';

interface WorkspaceNode {
  kind: string;
  name: string;
  children?: WorkspaceNode[];
}

function flatten(nodes: WorkspaceNode[] | undefined, parent = ''): string[] {
  return (nodes ?? []).flatMap((node) => {
    const path = parent === '' ? node.name : `${parent}/${node.name}`;
    return [path, ...flatten(node.children, path)];
  });
}

test('server filesystem: UI edits reconcile real files, survive reload, and respect depth', async ({ page }) => {
  test.setTimeout(60_000);
  const server = await startLocalWorkspaceServer(1);
  try {
    writeFileSync(join(server.directory, 'main.pcd'), 'pcd 1.0\nsystem shop "Before"\n');
    mkdirSync(join(server.directory, 'nested', 'deeper'), { recursive: true });
    writeFileSync(join(server.directory, 'nested', 'child.pcd'), 'pcd 1.0\nsystem child "Child"\n');
    writeFileSync(join(server.directory, 'nested', 'deeper', 'hidden.pcd'), 'pcd 1.0\nsystem hidden "Hidden"\n');
    mkdirSync(join(server.directory, '.git'));
    writeFileSync(join(server.directory, '.git', 'config'), 'preserve me\n');

    await page.goto(server.url);
    await openWorkspacePanels(page, ['sidebar', 'code']);
    await expect(page.getByTestId('workspace-storage')).toHaveText('Server storage: Server filesystem');
    const response = await fetch(`${server.url}/api/v1/workspace`);
    const workspace = await response.json() as { tree: WorkspaceNode };
    const paths = flatten(workspace.tree.children);
    expect(paths).toContain('main.pcd');
    expect(paths).toContain('nested/child.pcd');
    expect(paths).not.toContain('nested/deeper/hidden.pcd');
    expect(paths.some((path) => path.startsWith('.git'))).toBe(false);

    await page.getByTestId('tree-row-main.pcd').locator('.tree-name').click();
    await seedCode(page, 'pcd 1.0\nsystem shop "After UI edit"\n');
    await expect.poll(() => readFileSync(join(server.directory, 'main.pcd'), 'utf8')).toContain('After UI edit');

    await page.getByTestId('tree-new-file').click();
    await page.getByTestId('tree-create-input').fill('scratch.pcd');
    await page.getByTestId('tree-create-input').press('Enter');
    await expect.poll(() => existsSync(join(server.directory, 'scratch.pcd'))).toBe(true);

    let row = page.getByTestId('tree-row-scratch.pcd');
    await row.hover();
    await page.getByTestId('tree-ren-scratch.pcd').click();
    await page.getByTestId('tree-rename-input').fill('renamed.pcd');
    await page.getByTestId('tree-rename-input').press('Enter');
    await expect.poll(() => existsSync(join(server.directory, 'renamed.pcd'))).toBe(true);
    expect(existsSync(join(server.directory, 'scratch.pcd'))).toBe(false);
    expect(readFileSync(join(server.directory, 'main.pcd'), 'utf8')).toContain('After UI edit');

    row = page.getByTestId('tree-row-renamed.pcd');
    await row.hover();
    await page.getByTestId('tree-del-renamed.pcd').click();
    await page.getByTestId('tree-del-confirm-renamed.pcd').click();
    await expect(page.getByTestId('tree-row-renamed.pcd')).toHaveCount(0);
    await expect.poll(() => existsSync(join(server.directory, 'renamed.pcd'))).toBe(false);
    expect(readFileSync(join(server.directory, 'main.pcd'), 'utf8')).toContain('After UI edit');

    await page.reload();
    await openWorkspacePanels(page, ['sidebar', 'code']);
    await expect(page.locator('.cm-content')).toContainText('After UI edit');
    expect(readFileSync(join(server.directory, 'nested', 'deeper', 'hidden.pcd'), 'utf8')).toContain('Hidden');
    expect(readFileSync(join(server.directory, '.git', 'config'), 'utf8')).toBe('preserve me\n');
    expect(readFileSync(join(server.directory, '.panelcraft', 'workspace.json'), 'utf8')).toContain('openTabs');
  } finally {
    await server.stop();
  }
});

test('server filesystem: an external edit blocks stale saves and remains visible in both themes', async ({ page }) => {
  test.setTimeout(60_000);
  const server = await startLocalWorkspaceServer();
  try {
    const file = join(server.directory, 'main.pcd');
    writeFileSync(file, 'pcd 1.0\nsystem shop "Initial"\n');
    await page.goto(server.url);
    await openWorkspacePanels(page, ['sidebar', 'code']);
    await page.getByTestId('tree-row-main.pcd').locator('.tree-name').click();
    await expect(page.locator('.cm-content')).toContainText('Initial');

    writeFileSync(file, 'pcd 1.0\nsystem shop "External winner"\n');
    await seedCode(page, 'pcd 1.0\nsystem shop "Stale browser edit"\n');
    await expect(page.getByTestId('banner-storage-error')).toContainText('changed outside PanelCraft');
    await expect(page.getByTestId('status-pill')).toHaveText('Unsaved');
    expect(readFileSync(file, 'utf8')).toContain('External winner');
    await capture(page, 'storage-server-conflict-light', { golden: false });

    await setAppTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('banner-storage-error')).toBeVisible();
    await capture(page, 'storage-server-conflict-dark', { golden: false });

    await chooseAppMenu(page, 'tb-clear-data');
    await expect(page.getByTestId('clear-dialog')).toContainText('every workspace file on the server');
    await page.getByTestId('clear-cancel').click();
  } finally {
    await server.stop();
  }
});
