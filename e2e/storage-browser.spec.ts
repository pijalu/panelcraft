// SPDX-License-Identifier: GPL-3.0-only
// Static-hosting and browser-only directory capability scenarios.
import { expect, test, type Page } from '@playwright/test';
import { chooseAppMenu, openAppGroup, openWorkspacePanels, setAppTheme } from './lib/panels';
import { seedCode } from './lib/seed';
import { capture } from './lib/screenshots';

interface DirectoryTestWindow {
  __cancelNextPicker(): void;
  __pickerCalls(): number;
  __directorySnapshot(): Record<string, string>;
}

function trackApi(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) requests.push(request.url());
  });
  return requests;
}

/** A handle-compatible in-memory directory; no production test hooks are needed. */
function installMockDirectory(): void {
  type Node = {
    kind: 'file' | 'directory';
    name: string;
    text?: string;
    children?: Map<string, Node>;
  };
  const folder = (name: string): Node => ({ kind: 'directory', name, children: new Map() });
  const file = (name: string, text: string): Node => ({ kind: 'file', name, text });
  const root = folder('architecture');
  root.children?.set('main.pcd', file('main.pcd', 'pcd 1.0\nsystem folder "Directory seed"\n'));
  const git = folder('.git');
  git.children?.set('config', file('config', 'preserve git\n'));
  root.children?.set('.git', git);
  let calls = 0;
  let cancel = false;

  const fileHandle = (parent: Node, name: string) => {
    const node = parent.children?.get(name);
    if (node?.kind !== 'file') throw new DOMException('missing file', 'NotFoundError');
    let pending = node.text ?? '';
    return {
      kind: 'file' as const,
      name,
      getFile: async () => ({
        text: async () => node.text ?? '',
        arrayBuffer: async () => new TextEncoder().encode(node.text ?? '').buffer as ArrayBuffer,
      }),
      createWritable: async () => ({
        write: async (data: unknown) => { pending = String(data); },
        close: async () => { node.text = pending; },
      }),
    };
  };
  const directoryHandle = (node: Node): Record<string, unknown> => ({
    kind: 'directory',
    name: node.name,
    entries: async function* () {
      for (const name of node.children?.keys() ?? []) {
        const child = node.children?.get(name) as Node;
        yield [name, child.kind === 'directory' ? directoryHandle(child) : fileHandle(node, name)];
      }
    },
    getDirectoryHandle: async (name: string, options?: { create?: boolean }) => {
      let child = node.children?.get(name);
      if (child === undefined && options?.create) {
        child = folder(name);
        node.children?.set(name, child);
      }
      if (child?.kind !== 'directory') throw new DOMException('missing directory', 'NotFoundError');
      return directoryHandle(child);
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!node.children?.has(name) && options?.create) node.children?.set(name, file(name, ''));
      return fileHandle(node, name);
    },
    removeEntry: async (name: string) => {
      const child = node.children?.get(name);
      if (child === undefined) throw new DOMException('missing entry', 'NotFoundError');
      if (child.kind === 'directory' && child.children?.size) throw new DOMException('not empty', 'InvalidModificationError');
      node.children?.delete(name);
    },
  });
  const snapshot = (node: Node, parent = ''): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const child of node.children?.values() ?? []) {
      const path = parent === '' ? child.name : `${parent}/${child.name}`;
      if (child.kind === 'file') result[path] = child.text ?? '';
      else Object.assign(result, snapshot(child, path));
    }
    return result;
  };
  Object.assign(window, {
    showDirectoryPicker: async () => {
      calls++;
      if (cancel) {
        cancel = false;
        throw new DOMException('cancelled', 'AbortError');
      }
      return directoryHandle(root);
    },
    __cancelNextPicker: () => { cancel = true; },
    __pickerCalls: () => calls,
    __directorySnapshot: () => snapshot(root),
  });
}

test('static hosting uses browser storage, makes no API request, and hides unsupported folder access', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await openWorkspacePanels(page, ['sidebar']);
  await expect(page.getByTestId('tree-row-untitled.pcd')).toBeVisible();
  await expect(page.getByTestId('workspace-storage')).toHaveCount(0);
  await page.getByTestId('app-menu').click();
  await openAppGroup(page, 'menu-group-file');
  await expect(page.getByTestId('tb-open-directory')).toHaveCount(0);
  await expect(page.getByTestId('tb-import-zip')).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('browser directory: cancellation is safe, selection loads real handles, and edits stay off the network', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.addInitScript(installMockDirectory);
  await page.goto('/');
  await openWorkspacePanels(page, ['sidebar', 'code']);
  await seedCode(page, 'pcd 1.0\nsystem original "Keep after cancel"\n');

  await page.evaluate(() => (window as unknown as DirectoryTestWindow).__cancelNextPicker());
  await chooseAppMenu(page, 'tb-open-directory');
  await expect.poll(() => page.evaluate(() => (window as unknown as DirectoryTestWindow).__pickerCalls())).toBe(1);
  await expect(page.locator('.cm-content')).toContainText('Keep after cancel');
  await expect(page.getByTestId('banner-flash')).toHaveCount(0);

  await chooseAppMenu(page, 'tb-open-directory');
  await expect(page.getByTestId('workspace-storage')).toHaveText('Local folder: architecture');
  await expect(page.getByTestId('tree-row-main.pcd')).toBeVisible();
  await page.getByTestId('tree-row-main.pcd').locator('.tree-name').click();
  await expect(page.locator('.cm-content')).toContainText('Directory seed');
  await seedCode(page, 'pcd 1.0\nsystem folder "Saved to folder"\n');
  await expect.poll(() => page.evaluate(() => (window as unknown as DirectoryTestWindow).__directorySnapshot()['main.pcd']))
    .toContain('Saved to folder');
  const files = await page.evaluate(() => (window as unknown as DirectoryTestWindow).__directorySnapshot());
  expect(files['.git/config']).toBe('preserve git\n');
  expect(files['.panelcraft/workspace.json']).toContain('openTabs');
  await capture(page, 'storage-directory-light', { golden: false });

  await setAppTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'storage-directory-dark', { golden: false });
  await chooseAppMenu(page, 'tb-clear-data');
  await expect(page.getByTestId('clear-dialog')).toContainText('selected local folder');
  await capture(page, 'storage-directory-clear-dark', { golden: false });
  await page.getByTestId('clear-cancel').click();
  expect(apiRequests).toEqual([]);
});
