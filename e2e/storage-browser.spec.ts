// SPDX-License-Identifier: GPL-3.0-only
// Static-hosting and browser-only directory capability scenarios: the browser
// backend chain (native folder → origin-private files → Web Storage → legacy
// IndexedDB → memory), remembered native permission, and the guarantee that no
// browser backend ever reaches the network.
import { expect, test, type Page } from '@playwright/test';
import { chooseAppMenu, openAppGroup, openWorkspacePanels, setAppTheme } from './lib/panels';
import { seedCode } from './lib/seed';
import { capture } from './lib/screenshots';

/** Init-script surface installed by `installNativeDirectory`. */
interface NativeTestWindow {
  __pickerCalls(): number;
  __nativeFiles(): Promise<Record<string, string>>;
}

/** localStorage keys the fixture reads as scenario switches. */
const CANCEL_PICKER = 'e2e-cancel-picker';
const FORCE_PROMPT = 'e2e-force-prompt';
const DENY_PERMISSION = 'e2e-deny-permission';

function trackApi(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) requests.push(request.url());
  });
  return requests;
}

/**
 * Browser-side fixture. The picker hands back a REAL origin-private directory
 * handle, because only a real handle survives the structured clone into the
 * remembered-handle store — a plain mock object cannot be persisted, so a mock
 * would silently test the session-only path instead of memory across reloads.
 * Permission state is scripted through the handle prototype, so the reconnect
 * scenarios exercise the real query/request calls the app makes.
 *
 * Lives entirely in the page: init scripts are serialized, so it may not read
 * anything from this module.
 */
function installNativeDirectory(): void {
  const write = async (dir: FileSystemDirectoryHandle, name: string, text: string): Promise<void> => {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  };
  const folder = async (path: string): Promise<FileSystemDirectoryHandle> => {
    let current = await navigator.storage.getDirectory();
    for (const part of path.split('/')) current = await current.getDirectoryHandle(part, { create: true });
    return current;
  };
  const list = async (dir: FileSystemDirectoryHandle, parent = ''): Promise<Record<string, string>> => {
    const result: Record<string, string> = {};
    for await (const [name, handle] of dir.entries()) {
      const path = parent === '' ? name : `${parent}/${name}`;
      if (handle.kind === 'file') {
        result[path] = await (await (handle as FileSystemFileHandle).getFile()).text();
      } else {
        Object.assign(result, await list(handle as FileSystemDirectoryHandle, path));
      }
    }
    return result;
  };

  let calls = 0;
  Object.assign(window, {
    showDirectoryPicker: async (): Promise<FileSystemDirectoryHandle> => {
      calls++;
      if (localStorage.getItem('e2e-cancel-picker') === '1') {
        localStorage.removeItem('e2e-cancel-picker');
        throw new DOMException('cancelled', 'AbortError');
      }
      const dir = await folder('architecture');
      await write(dir, 'main.pcd', 'pcd 1.0\nsystem folder "Directory seed"\n');
      const git = await dir.getDirectoryHandle('.git', { create: true });
      await write(git, 'config', 'preserve git\n');
      return dir;
    },
    __pickerCalls: () => calls,
    __nativeFiles: async () => list(await folder('architecture')),
  });

  // Scripted permission: `prompt` until a reconnect click, `denied` on demand.
  const proto = FileSystemDirectoryHandle.prototype as unknown as Record<string, unknown>;
  proto.queryPermission = async function queryPermission(): Promise<string> {
    if (localStorage.getItem('e2e-force-prompt') === '1') return 'prompt';
    if (localStorage.getItem('e2e-deny-permission') === '1') return 'denied';
    return 'granted';
  };
  proto.requestPermission = async function requestPermission(): Promise<string> {
    if (localStorage.getItem('e2e-deny-permission') === '1') return 'denied';
    localStorage.removeItem('e2e-force-prompt');
    return 'granted';
  };
}

/** The persisted Web Storage workspace record (empty when another backend is active). */
function localWorkspaceText(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('panelcraft.workspace.v1') ?? '');
}

/** Text of the IndexedDB workspace record, as the app wrote it. */
function idbWorkspaceText(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('panelcraft');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      request.onsuccess = () => {
        resolve(JSON.stringify(request.result ?? null));
        open.result.close();
      };
    };
  }));
}

/** Entry names inside the origin-private workspace directory (absent ⇒ empty). */
function opfsWorkspaceEntryNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    try {
      const dir = await root.getDirectoryHandle('panelcraft-workspace');
      for await (const [name] of dir.entries()) names.push(name);
    } catch {
      return [];
    }
    return names;
  });
}

/** Files panel open with its storage controls visible. */
async function openFiles(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['sidebar', 'code']);
  await expect(page.getByTestId('storage-actions')).toBeVisible();
}

/**
 * Label of the active backend, reopening the Files panel if needed: a switched
 * workspace carries its own panel layout, which may start collapsed.
 */
async function storageLabel(page: Page): Promise<string> {
  const rail = page.getByTestId('expand-sidebar');
  if (await rail.count() > 0) await rail.click();
  const label = page.getByTestId('workspace-storage');
  return (await label.count()) > 0 ? ((await label.textContent()) ?? '') : '';
}

test('static hosting opens origin-private browser files and hides unsupported folder access', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');
  await expect(page.getByTestId('tree-row-untitled.pcd')).toBeVisible();
  // No picker → no native action in the Files panel, and none in the menu.
  await expect(page.getByTestId('storage-open-directory')).toHaveCount(0);
  await expect(page.getByTestId('storage-hint')).toContainText('not visible in your file manager');
  await page.getByTestId('app-menu').click();
  await openAppGroup(page, 'menu-group-file');
  await expect(page.getByTestId('tb-open-directory')).toHaveCount(0);
  await expect(page.getByTestId('tb-import-zip')).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('origin-private files keep an edit across reload without any API request', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.goto('/');
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');
  await seedCode(page, 'pcd 1.0\nsystem opfs "Survives reload"\n');
  await expect.poll(() => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('panelcraft-workspace');
    return (await (await dir.getFileHandle('untitled.pcd')).getFile()).text();
  })).toContain('Survives reload');

  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');
  await expect(page.locator('.cm-content')).toContainText('Survives reload');
  await capture(page, 'storage-opfs-light', { golden: false });
  await setAppTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'storage-opfs-dark', { golden: false });
  expect(apiRequests).toEqual([]);
});

test('Web Storage is the next backend when origin-private files are unavailable', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined, configurable: true });
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser storage (Web Storage)');
  await seedCode(page, 'pcd 1.0\nsystem local "Survives reload"\n');
  await expect.poll(() => localWorkspaceText(page)).toContain('Survives reload');

  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser storage (Web Storage)');
  await expect(page.locator('.cm-content')).toContainText('Survives reload');
  expect(apiRequests).toEqual([]);
});

test('an existing IndexedDB workspace is never hidden by empty preferred backends', async ({ page }) => {
  const apiRequests = trackApi(page);
  // `?legacy` blocks the preferred backends for the first boot, so only
  // IndexedDB can hold a workspace then. That is the older browser profile.
  await page.addInitScript(() => {
    if (!location.search.includes('legacy')) return;
    Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined, configurable: true });
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
      configurable: true,
    });
  });
  await page.goto('/?legacy');
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser storage (IndexedDB)');
  await seedCode(page, 'pcd 1.0\nsystem legacy "Written to IndexedDB"\n');
  await expect.poll(() => idbWorkspaceText(page)).toContain('Written to IndexedDB');

  // Second boot: the preferred backends exist but are empty. The existing
  // IndexedDB workspace wins, and nothing is copied into the empty ones.
  await page.goto('/');
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser storage (IndexedDB)');
  await expect(page.locator('.cm-content')).toContainText('Written to IndexedDB');
  await expect.poll(() => opfsWorkspaceEntryNames(page)).toEqual([]);
  expect(await localWorkspaceText(page)).toBe('');
  expect(apiRequests).toEqual([]);
});

test('native folder: cancellation is safe, files open for editing, and the handle is remembered', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.addInitScript(installNativeDirectory);
  await page.goto('/');
  await openFiles(page);
  await seedCode(page, 'pcd 1.0\nsystem original "Keep after cancel"\n');

  await page.evaluate((flag) => localStorage.setItem(flag, '1'), CANCEL_PICKER);
  await page.getByTestId('storage-open-directory').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as NativeTestWindow).__pickerCalls())).toBe(1);
  await expect(page.locator('.cm-content')).toContainText('Keep after cancel');
  await expect(page.getByTestId('banner-flash')).toHaveCount(0);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');

  await page.getByTestId('storage-open-directory').click();
  await expect(page.getByTestId('workspace-storage')).toHaveText('Local folder: architecture');
  await expect(page.getByTestId('tree-row-main.pcd')).toBeVisible();
  await page.getByTestId('tree-row-main.pcd').locator('.tree-name').click();
  await expect(page.locator('.cm-content')).toContainText('Directory seed');
  await seedCode(page, 'pcd 1.0\nsystem folder "Saved to folder"\n');
  await expect.poll(() => page.evaluate(() => (window as unknown as NativeTestWindow).__nativeFiles()))
    .toMatchObject({ 'main.pcd': expect.stringContaining('Saved to folder') });
  const files = await page.evaluate(() => (window as unknown as NativeTestWindow).__nativeFiles());
  expect(files['.git/config']).toBe('preserve git\n');
  await expect.poll(() => page.evaluate(() => (window as unknown as NativeTestWindow).__nativeFiles()))
    .toMatchObject({ '.panelcraft/workspace.json': expect.stringContaining('openTabs') });
  await capture(page, 'storage-directory-light', { golden: false });

  await setAppTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'storage-directory-dark', { golden: false });
  await chooseAppMenu(page, 'tb-clear-data');
  await expect(page.getByTestId('clear-dialog')).toContainText('selected local folder');
  await capture(page, 'storage-directory-clear-dark', { golden: false });
  await page.getByTestId('clear-cancel').click();
  expect(await page.evaluate(() => (window as unknown as NativeTestWindow).__pickerCalls())).toBe(2);

  // Reload: the remembered handle is reused and no second picker appears.
  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Local folder: architecture');
  await expect(page.getByTestId('tree-row-main.pcd')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as NativeTestWindow).__pickerCalls())).toBe(0);
  expect(apiRequests).toEqual([]);
});

test('lapsed native permission falls back without prompting, and reconnect grants it on click', async ({ page }) => {
  const apiRequests = trackApi(page);
  await page.addInitScript(installNativeDirectory);
  await page.goto('/');
  await openFiles(page);
  await page.getByTestId('storage-open-directory').click();
  await expect.poll(() => storageLabel(page)).toBe('Local folder: architecture');

  // Permission is no longer granted: startup must not prompt, and the browser
  // fallback carries the session until the user reconnects.
  await page.evaluate((flag) => localStorage.setItem(flag, '1'), FORCE_PROMPT);
  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');
  await expect(page.getByTestId('storage-reconnect')).toBeVisible();
  await expect(page.getByTestId('storage-reconnect-hint')).toContainText('permission again');

  // Denial keeps the fallback and says so; nothing switches behind the user.
  await page.evaluate((flag) => localStorage.setItem(flag, '1'), DENY_PERMISSION);
  await page.getByTestId('storage-reconnect').click();
  await expect(page.getByTestId('banner-flash')).toContainText('permission was not granted');
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');

  // The reconnect click is what grants access; then the folder is active again.
  await page.evaluate((flag) => localStorage.removeItem(flag), DENY_PERMISSION);
  await page.getByTestId('storage-reconnect').click();
  await expect.poll(() => storageLabel(page)).toBe('Local folder: architecture');
  await openFiles(page);
  await expect(page.getByTestId('storage-reconnect')).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test('leaving a native folder is explicit and forgets the handle only after switching', async ({ page }) => {
  await page.addInitScript(installNativeDirectory);
  await page.goto('/');
  await openFiles(page);
  await page.getByTestId('storage-open-directory').click();
  await expect.poll(() => storageLabel(page)).toBe('Local folder: architecture');
  await openFiles(page);
  await expect(page.getByTestId('storage-hint')).toContainText('stay on disk');
  await page.getByTestId('storage-use-browser').click();
  await expect.poll(() => storageLabel(page)).toBe('Browser files (origin-private)');
  // The folder's files stay on disk; nothing is copied into browser files.
  const files = await page.evaluate(() => (window as unknown as NativeTestWindow).__nativeFiles());
  expect(files['main.pcd']).toContain('Directory seed');

  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId('workspace-storage')).toHaveText('Browser files (origin-private)');
  await expect(page.getByTestId('storage-reconnect')).toHaveCount(0);
});
