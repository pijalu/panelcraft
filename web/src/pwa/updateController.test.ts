// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: consensual update flow. A new shell must never take over a live
// editor session on its own: it waits, the app offers "Update available", and
// only an explicit Restart flushes work, activates the worker and reloads once.
import { describe, expect, it, vi } from 'vitest';
import { createUpdateController, type UpdateState } from './updateController';

interface FakeWorker {
  postMessage: (message: unknown) => void;
}
interface FakeContainer {
  addEventListener: (type: string, handler: () => void) => void;
  emit: (type: string) => void;
}

function harness(options: { busy?: boolean; prepare?: () => Promise<void>; unapplied?: string | null } = {}) {
  const postMessage = vi.fn();
  const waiting: FakeWorker = { postMessage };
  const container: FakeContainer & { handlers: Map<string, Array<() => void>> } = {
    handlers: new Map(),
    addEventListener(type, handler) {
      container.handlers.set(type, [...(container.handlers.get(type) ?? []), handler]);
    },
    emit(type) {
      for (const handler of container.handlers.get(type) ?? []) handler();
    },
  };
  const reload = vi.fn();
  const prepare = vi.fn(options.prepare ?? (async () => undefined));
  const states: UpdateState[] = [];
  let busy = options.busy ?? false;
  let unapplied = options.unapplied ?? null;
  const controller = createUpdateController({
    waiting: () => waiting,
    container,
    prepare,
    reload,
    isBusy: () => busy,
    unappliedWork: () => unapplied,
    onChange: (state) => states.push(state),
  });
  return {
    controller,
    waiting,
    postMessage,
    container,
    prepare,
    reload,
    states,
    setBusy: (next: boolean) => {
      busy = next;
    },
    setUnapplied: (next: string | null) => {
      unapplied = next;
    },
  };
}

describe('update controller (UX08-WP04)', () => {
  it('starts idle and ignores a missing worker', () => {
    const { controller, states } = harness();
    expect(controller.state()).toBe('idle');
    expect(controller.promptVisible()).toBe(false);
    expect(states).toEqual([]);
  });

  it('offers the update once a worker is waiting', () => {
    const { controller } = harness();
    controller.workerWaiting();
    expect(controller.state()).toBe('available');
    expect(controller.promptVisible()).toBe(true);
  });

  it('does not reload on Later: the offer is deferred, not dropped', () => {
    const { controller, reload, prepare } = harness();
    controller.workerWaiting();
    controller.later();
    expect(reload).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    // The banner goes away but the worker keeps waiting, so the menu can still
    // offer the restart (state stays reachable, visibility does not).
    expect(controller.state()).toBe('deferred');
    expect(controller.promptVisible()).toBe(false);
  });

  it('Restart flushes app state, activates the waiting worker and reloads once', async () => {
    const { controller, postMessage, container, prepare, reload } = harness();
    controller.workerWaiting();
    await expect(controller.accept()).resolves.toBe('applying');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'panelcraft:sw-activate' });
    expect(reload).not.toHaveBeenCalled(); // waits for controllerchange
    container.emit('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
    // a second controllerchange (multiple clients) must not reload again
    container.emit('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('queues the offer during a presentation instead of interrupting it', async () => {
    const { controller, setBusy, reload } = harness();
    setBusy(true);
    controller.workerWaiting();
    expect(controller.state()).toBe('available');
    expect(controller.promptVisible()).toBe(false); // queued, playback keeps focus
    setBusy(false);
    controller.resume();
    expect(controller.promptVisible()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads when the preparation fails, and reports the failure', async () => {
    const failing = harness();
    failing.prepare.mockRejectedValueOnce(new Error('idb blocked'));
    failing.controller.workerWaiting();
    await expect(failing.controller.accept()).rejects.toThrow('idb blocked');
    expect(failing.postMessage).not.toHaveBeenCalled();
    expect(failing.reload).not.toHaveBeenCalled();
    expect(failing.controller.state()).toBe('available');
  });

  it('does not prepare twice when Restart is pressed again while applying', async () => {
    const { controller, prepare } = harness();
    controller.workerWaiting();
    const first = controller.accept();
    const second = controller.accept();
    await Promise.all([first, second]);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding unapplied editor work, then restarts on confirmation', async () => {
    const { controller, prepare, postMessage, setUnapplied } = harness({ unapplied: 'src/api.pcd' });
    controller.workerWaiting();
    // Unsaved work cannot be flushed by the app, so the restart must be explicit.
    await expect(controller.accept()).resolves.toBe('needs-confirmation');
    expect(controller.state()).toBe('available');
    expect(prepare).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    setUnapplied('src/api.pcd');
    await expect(controller.accept({ force: true })).resolves.toBe('applying');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'panelcraft:sw-activate' });
  });

  it('never reloads when a worker claims the page without a restart request', () => {
    // The first install calls clients.claim(); that fires controllerchange on a
    // page that never asked for an update. Reloading there would be the silent
    // auto-update this WP forbids (and it discarded the user's view state).
    const { controller, container, reload } = harness();
    container.emit('controllerchange');
    expect(reload).not.toHaveBeenCalled();
    expect(controller.state()).toBe('idle');
  });

  it('reports every state transition once', () => {
    const { controller, states } = harness();
    controller.workerWaiting();
    controller.later();
    expect(states).toEqual(['available', 'deferred']);
  });
});
