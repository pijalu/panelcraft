// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: registration is base-path safe and a waiting worker never activates
// itself — the page decides. These tests drive the wiring with fakes so the
// rules (first visit silent, update offered, restart flushes and reloads once)
// hold without a browser worker.
import { describe, expect, it, vi } from 'vitest';
import { startServiceWorker, watchForUpdates, workerUrl, type ContainerLike, type RegistrationLike } from './sw-register';

interface Harness {
  container: ContainerLike;
  registration: RegistrationLike;
  reload: () => void;
  prepare: () => Promise<void>;
  controllerChanges: Array<() => void>;
  updateFound: Array<() => void>;
  worker: { postMessage: ReturnType<typeof vi.fn>; state: string; listeners: Array<() => void> };
  setWaiting: (waiting: boolean) => void;
  setController: (controlled: boolean) => void;
  install: (state: string) => void;
}

function harness(): Harness {
  const worker = {
    postMessage: vi.fn(),
    state: 'installing',
    listeners: [] as Array<() => void>,
  };
  let waiting: RegistrationLike['waiting'] = null;
  let controller: unknown = null;
  const controllerChanges: Array<() => void> = [];
  const updateFound: Array<() => void> = [];

  let installing: RegistrationLike['installing'] = null;
  const registration: RegistrationLike = {
    get waiting() {
      return waiting;
    },
    get installing() {
      return installing;
    },
    addEventListener: (type, handler) => {
      if (type === 'updatefound') updateFound.push(handler);
    },
  };
  const container: ContainerLike = {
    register: vi.fn(async () => registration),
    get controller() {
      return controller;
    },
    addEventListener: (_type, handler) => {
      controllerChanges.push(handler);
    },
  };

  return {
    container,
    registration,
    reload: vi.fn() as unknown as () => void,
    prepare: vi.fn(async () => undefined) as unknown as () => Promise<void>,
    controllerChanges,
    updateFound,
    worker,
    setWaiting: (next) => {
      waiting = next ? worker : null;
    },
    setController: (controlled) => {
      controller = controlled ? {} : null;
    },
    install: (state) => {
      // Real sequence: `updatefound` (the page subscribes), then the installing
      // worker reports `statechange` → installed, and takes the waiting slot.
      installing = {
        get state() {
          return worker.state;
        },
        addEventListener: (_type, handler) => worker.listeners.push(handler),
      };
      for (const listener of updateFound) listener();
      worker.state = state;
      if (state === 'installed') waiting = worker;
      for (const listener of worker.listeners) listener();
    },
  };
}

describe('service worker registration (UX08-WP04)', () => {
  it('registers the worker next to the bundle for any base path', async () => {
    expect(workerUrl('https://example.test/panelcraft/')).toBe('https://example.test/panelcraft/sw.js');
    expect(workerUrl('https://example.test/')).toBe('https://example.test/sw.js');
    const fake = harness();
    expect(workerUrl('https://example.test/panelcraft/')).toBe('https://example.test/panelcraft/sw.js');
    await startServiceWorker({
      container: fake.container,
      baseURI: 'https://example.test/panelcraft/',
      prepare: fake.prepare,
      reload: fake.reload,
    });
    expect(fake.container.register).toHaveBeenCalledWith(expect.stringContaining('sw.js'));
  });

  it('stays silent on the first visit: an uncontrolled page has nothing to update', async () => {
    const fake = harness();
    const controller = watchForUpdates(fake.registration, {
      container: fake.container,
      prepare: fake.prepare,
      reload: fake.reload,
    });
    fake.setWaiting(true);
    fake.setController(false);
    fake.install('installed');
    expect(controller.state()).toBe('idle');
  });

  it('offers the update once a controlled page sees the worker install', async () => {
    const fake = harness();
    fake.setController(true);
    const controller = watchForUpdates(fake.registration, {
      container: fake.container,
      prepare: fake.prepare,
      reload: fake.reload,
    });
    fake.install('installed');
    expect(controller.state()).toBe('available');
    expect(controller.promptVisible()).toBe(true);
  });

  it('surfaces an already-waiting worker from a previous visit', () => {
    const fake = harness();
    fake.setController(true);
    fake.setWaiting(true);
    const controller = watchForUpdates(fake.registration, {
      container: fake.container,
      prepare: fake.prepare,
      reload: fake.reload,
    });
    expect(controller.state()).toBe('available');
  });

  it('restart flushes, activates the waiting worker and reloads exactly once', async () => {
    const fake = harness();
    fake.setController(true);
    fake.setWaiting(true);
    const controller = watchForUpdates(fake.registration, {
      container: fake.container,
      prepare: fake.prepare,
      reload: fake.reload,
    });
    await controller.accept();
    expect(fake.prepare).toHaveBeenCalledTimes(1);
    expect(fake.worker.postMessage).toHaveBeenCalledWith({ type: 'panelcraft:sw-activate' });
    expect(fake.reload).not.toHaveBeenCalled();
    for (const handler of fake.controllerChanges) handler();
    for (const handler of fake.controllerChanges) handler();
    expect(fake.reload).toHaveBeenCalledTimes(1);
  });
});
