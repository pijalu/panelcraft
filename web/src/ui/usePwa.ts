// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: the PWA lifecycle as a component-facing hook. It owns the service
// worker registration, the install affordance and the update controller, so the
// shell only renders state and calls `restart`/`install`.
//
// Nothing here reloads on its own: an update becomes a banner the user acts on,
// and a running presentation queues it instead of stealing focus.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { createInstallHandle, type InstallAvailability, type InstallHandle } from '../pwa/install';
import { startServiceWorker } from '../sw-register';
import { s } from './strings';
import type { UpdateState } from '../pwa/updateController';

export interface PwaHandle {
  install: InstallAvailability;
  /** Why the restart needs a confirmation, or null when it can run directly. */
  unapplied: string | null;
  update: UpdateState;
  /** True when the "Update available" banner should be on screen. */
  updateVisible: boolean;
  restart: (options?: { force?: boolean }) => Promise<void>;
  /** Dismiss the offer without activating the worker (kept available). */
  later: () => void;
  installPrompt: () => Promise<void>;
  /** Playback/presentation ended: surface an offer that was queued. */
  playbackEnded: () => void;
}

export interface PwaDeps {
  /** Flush workspace storage before the new shell takes over. */
  prepare: () => Promise<void>;
  /** Reload once the waiting worker controls the page. */
  reload: () => void;
  /** True while playback/presentation must not be interrupted. */
  isBusy: () => boolean;
  /** Unapplied editor work the reload would discard. */
  unapplied: () => string | null;
  onError: (message: string) => void;
  /** Reported once the user asked to install from a browser without a prompt. */
  onGuidance: () => void;
}

/** Shell-facing wrapper: one call site, explicit about what the restart needs. */
export function useShellPwa(deps: {
  flush: () => Promise<void>;
  divergedPath: string | null;
  busy: boolean;
  onFlash: (message: string) => void;
}): PwaHandle {
  return usePwa({
    prepare: deps.flush,
    reload: () => window.location.reload(),
    isBusy: () => deps.busy,
    unapplied: () => deps.divergedPath,
    onError: deps.onFlash,
    onGuidance: () => deps.onFlash(s('Use your browser\'s Install / Add to Home Screen action to install PanelCraft.')),
  });
}

export function usePwa(deps: PwaDeps): PwaHandle {
  const [update, setUpdate] = useState<UpdateState>('idle');
  const [install, setInstall] = useState<InstallAvailability>('installed');
  const [updateVisible, setUpdateVisible] = useState(false);
  const controller = useRef<{
    accept: (o?: { force?: boolean }) => Promise<string>;
    later: () => void;
    resume: () => void;
  } | null>(null);
  const installHandle = useRef<InstallHandle | null>(null);
  const latest = useRef(deps);
  latest.current = deps;

  useEffect(() => {
    const handle = createInstallHandle(window);
    installHandle.current = handle;
    setInstall(handle.availability());
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    startServiceWorker({
      container: navigator.serviceWorker,
      prepare: () => latest.current.prepare(),
      reload: () => latest.current.reload(),
      isBusy: () => latest.current.isBusy(),
      unappliedWork: () => latest.current.unapplied(),
      onChange: (state) => {
        if (cancelled) return;
        setUpdate(state);
        setUpdateVisible(state === 'available');
      },
    })
      .then((started) => {
        if (!cancelled) controller.current = started;
      })
      .catch(() => {
        // No worker (dev server, insecure context): the app stays online-only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const restart = useCallback(async (options?: { force?: boolean }) => {
    const worker = controller.current;
    if (worker === null) return;
    const outcome = await worker.accept(options);
    if (outcome === 'needs-confirmation') {
      // The shell asks; `restart({force:true})` runs after the user agrees.
      return;
    }
    if (outcome === 'applying') setUpdateVisible(false);
  }, []);

  const installPrompt = useCallback(async () => {
    const handle = installHandle.current;
    if (handle === null) return;
    const outcome = await handle.promptInstall();
    if (outcome === 'guidance') latest.current.onGuidance();
    setInstall(handle.availability());
  }, []);

  const later = useCallback(() => {
    controller.current?.later();
    setUpdateVisible(false);
  }, []);

  const playbackEnded = useCallback(() => {
    controller.current?.resume();
  }, []);

  return {
    install,
    unapplied: update === 'idle' ? null : deps.unapplied(),
    update,
    updateVisible,
    restart,
    later,
    installPrompt,
    playbackEnded,
  };
}
