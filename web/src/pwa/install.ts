// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: install affordance. Chromium fires `beforeinstallprompt` once the
// manifest, icons and worker qualify; we keep that event so the Application menu
// can offer "Install application" on demand. Browsers without the event (Safari,
// Firefox) get the same menu entry as written guidance instead, and a standalone
// (already installed) window never sees the entry at all — no install nag.

export type InstallAvailability = 'installed' | 'ready' | 'guidance';

/** The slice of the BeforeInstallPromptEvent Chromium provides. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallTarget {
  matchMedia?: (query: string) => { matches: boolean };
  addEventListener?: (type: 'beforeinstallprompt', handler: (event: Event) => void) => void;
  navigator?: { standalone?: boolean } | Navigator;
}

export interface InstallHandle {
  availability(): InstallAvailability;
  /** Resolve what to do: a real prompt when the browser offered one. */
  promptInstall(): Promise<'accepted' | 'dismissed' | 'guidance'>;
  /** Standalone mode flips after a successful install inside this session. */
  markInstalled(): void;
}

export function createInstallHandle(target: InstallTarget = window): InstallHandle {
  let deferred: InstallPromptEvent | null = null;
  let installed = isStandalone(target);

  target.addEventListener?.('beforeinstallprompt', (event) => {
    // Keep the event and suppress the browser's own mini-infobar: the app offers
    // install in its menu instead of pushing a banner.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
  });

  const availability = (): InstallAvailability => {
    if (installed) return 'installed';
    return deferred === null ? 'guidance' : 'ready';
  };

  return {
    availability,
    async promptInstall() {
      if (installed) return 'dismissed';
      const event = deferred;
      if (event === null) return 'guidance';
      await event.prompt();
      const choice = (await event.userChoice)?.outcome ?? 'dismissed';
      if (choice === 'accepted') installed = true;
      deferred = null;
      return choice;
    },
    markInstalled() {
      installed = true;
      deferred = null;
    },
  };
}

/** A standalone window (installed PWA) must not be told to install itself. */
export function isStandalone(target: InstallTarget = window): boolean {
  if (target.matchMedia?.('(display-mode: standalone)').matches === true) return true;
  // iOS Safari exposes navigator.standalone; other browsers leave it undefined.
  return (target.navigator as { standalone?: boolean } | undefined)?.standalone === true;
}
