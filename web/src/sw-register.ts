// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: service-worker registration + update detection. Registration is
// base-path safe (the worker is resolved against the document base, so the same
// bundle works at / and under /panelcraft/), and a newly installed worker is
// handed to the update controller instead of activating itself: nothing takes
// over a live editing session without the user's explicit Restart.
import { createUpdateController, type UpdateController, type UpdateState } from './pwa/updateController';

/** The slice of ServiceWorkerRegistration this module needs. */
export interface RegistrationLike {
  waiting: { postMessage: (message: unknown) => void } | null;
  installing: { state: string; addEventListener: (type: 'statechange', handler: () => void) => void } | null;
  addEventListener: (type: 'updatefound', handler: () => void) => void;
}

/** The slice of ServiceWorkerContainer this module needs. */
export interface ContainerLike {
  register: (url: string) => Promise<RegistrationLike>;
  controller: unknown;
  addEventListener: (type: 'controllerchange', handler: () => void) => void;
}

export interface UpdateWiring {
  container: ContainerLike;
  /** Document base (defaults to the live document); the worker sits beside it. */
  baseURI?: string;
  /** Flush workspace storage before the new shell takes over. */
  prepare: () => Promise<void>;
  reload: () => void;
  isBusy?: () => boolean;
  unappliedWork?: () => string | null;
  onChange?: (state: UpdateState) => void;
}

/**
 * Watch an installed registration for updates and return the controller the UI
 * binds to. Split from registration so tests drive it without a browser worker.
 */
export function watchForUpdates(registration: RegistrationLike, wiring: UpdateWiring): UpdateController {
  const controller = createUpdateController({
    waiting: () => registration.waiting,
    container: wiring.container,
    prepare: wiring.prepare,
    reload: wiring.reload,
    isBusy: wiring.isBusy,
    unappliedWork: wiring.unappliedWork,
    onChange: wiring.onChange,
  });

  // Only a controlled page can be updated in place: on the very first visit
  // there is nothing to replace, so the new worker may activate silently.
  const offer = (): void => {
    if (registration.waiting === null || wiring.container.controller === null) return;
    controller.workerWaiting();
  };

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') offer();
    });
  });
  offer(); // an update may already be waiting from a previous visit
  return controller;
}

/** Register the worker for this bundle's scope and wire the update contract. */
export async function startServiceWorker(wiring: UpdateWiring): Promise<UpdateController | null> {
  const base = wiring.baseURI ?? document.baseURI;
  const registration = await wiring.container.register(workerUrl(base));
  return watchForUpdates(registration, wiring);
}

/** The worker always sits next to the bundle, whatever the base path is. */
export function workerUrl(baseURI: string): string {
  return new URL('sw.js', baseURI).href;
}
