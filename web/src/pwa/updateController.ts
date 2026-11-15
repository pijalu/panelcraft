// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: the consensual update lifecycle, kept out of the DOM so the rules
// are unit-testable. The service worker waits on purpose (no skipWaiting); this
// controller decides when the app offers the restart, flushes work first, and
// reloads exactly once when the new worker takes control.
//
// Product rules encoded here:
// - no automatic reload, ever;
// - a running presentation/playback is never interrupted — the offer is queued
//   and surfaces when playback ends;
// - "Later" keeps the offer available instead of dropping it;
// - prep failures leave the old shell running and are reported to the caller.

export type UpdateState = 'idle' | 'available' | 'deferred' | 'applying';

/** The slice of ServiceWorkerRegistration the controller needs. */
export interface WaitingWorker {
  postMessage(message: unknown): void;
}

/** The slice of ServiceWorkerContainer the controller needs. */
export interface UpdateEvents {
  addEventListener(type: 'controllerchange', handler: () => void): void;
}

export interface UpdateControllerOptions {
  /** The installed-but-waiting worker, read on demand (it appears later). */
  waiting: () => WaitingWorker | null;
  /** Container that emits `controllerchange` once the new worker controls us. */
  container: UpdateEvents;
  /** Flush workspace storage and editor buffers before the swap. */
  prepare: () => Promise<void>;
  /** Reload the page (called at most once). */
  reload: () => void;
  /** True while playback/presentation must not be interrupted. */
  isBusy?: () => boolean;
  /** A description of work the app cannot flush (e.g. an unapplied buffer). */
  unappliedWork?: () => string | null;
  onChange?: (state: UpdateState) => void;
}

export type AcceptOutcome = 'applying' | 'needs-confirmation' | 'no-worker';

export interface UpdateController {
  state(): UpdateState;
  /** True when the "Update available" surface should be visible right now. */
  promptVisible(): boolean;
  /** A new worker finished installing and is waiting for our go-ahead. */
  workerWaiting(): void;
  /** Playback ended: surface an offer that was queued while busy. */
  resume(): void;
  /** Restart: flush, activate the worker, reload once on controllerchange.
   *  `force` skips the confirmation for work that cannot be flushed. */
  accept(options?: { force?: boolean }): Promise<AcceptOutcome>;
  /** Dismiss the offer without activating anything. */
  later(): void;
}

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  let state: UpdateState = 'idle';
  let queued = false;
  let applying: Promise<AcceptOutcome> | null = null;
  let reloaded = false;
  // Listen once. A `controllerchange` is only a reason to reload when *we* asked
  // for the activation: the first install claims the page on its own, and
  // reloading then would be the silent auto-update this design forbids.
  let requested = false;
  options.container.addEventListener('controllerchange', () => {
    if (!requested || reloaded) return;
    reloaded = true;
    options.reload();
  });

  const set = (next: UpdateState): void => {
    if (state === next) return;
    state = next;
    options.onChange?.(next);
  };

  const busy = (): boolean => options.isBusy?.() === true;

  return {
    state: () => state,
    promptVisible: () => state === 'available' && !queued && options.waiting() !== null,

    workerWaiting(): void {
      if (state === 'applying') return;
      // During playback the offer is held back so it cannot steal focus.
      queued = busy();
      set('available');
    },

    resume(): void {
      queued = false;
    },

    accept(params?: { force?: boolean }): Promise<AcceptOutcome> {
      if (applying !== null) return applying.then((): AcceptOutcome => 'applying');
      const waiting = options.waiting();
      if (waiting === null) return Promise.resolve('no-worker');
      // Work the app cannot flush (an unapplied code buffer) must not be
      // discarded by a reload without an explicit confirmation.
      if (params?.force !== true && (options.unappliedWork?.() ?? null) !== null) {
        return Promise.resolve('needs-confirmation');
      }
      applying = (async (): Promise<AcceptOutcome> => {
        queued = false;
        set('applying');
        try {
          // Flush first: if this fails the old shell keeps running untouched.
          await options.prepare();
        } catch (error) {
          set('available');
          applying = null;
          throw error;
        }
        requested = true;
        waiting.postMessage({ type: 'panelcraft:sw-activate' });
        applying = null;
        return 'applying';
      })();
      return applying;
    },

    later(): void {
      if (state === 'applying' || state === 'idle') return;
      set('deferred');
    },
  };
}
