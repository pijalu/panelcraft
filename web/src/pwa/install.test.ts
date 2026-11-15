// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: install affordance rules — the menu entry exists only when it can
// do something, a standalone window is never nagged, and the browser's own
// mini-infobar is suppressed in favour of the on-demand entry.
import { describe, expect, it, vi } from 'vitest';
import { createInstallHandle, isStandalone, type InstallTarget } from './install';

function target(options: { standalone?: boolean; navigatorStandalone?: boolean } = {}) {
  const handlers: Array<(event: Event) => void> = [];
  const scope: InstallTarget = {
    matchMedia: (query: string) => ({ matches: options.standalone === true && query.includes('standalone') }),
    addEventListener: (_type, handler) => {
      handlers.push(handler);
    },
    navigator: { standalone: options.navigatorStandalone === true },
  };
  const emit = (event: Event): void => {
    for (const handler of handlers) handler(event);
  };
  return { scope, emit, handlers };
}

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  return event as Event & { preventDefault: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> };
}

describe('install affordance (UX08-WP04)', () => {
  it('reports guidance when the browser never offers a prompt', () => {
    const { scope } = target();
    expect(createInstallHandle(scope).availability()).toBe('guidance');
  });

  it('suppresses the browser mini-infobar and remembers the event', async () => {
    const { scope, emit } = target();
    const handle = createInstallHandle(scope);
    const event = promptEvent('accepted');
    emit(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(handle.availability()).toBe('ready');
    await expect(handle.promptInstall()).resolves.toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('uses each prompt event once and falls back to guidance afterwards', async () => {
    const { scope, emit } = target();
    const handle = createInstallHandle(scope);
    emit(promptEvent('dismissed'));
    await expect(handle.promptInstall()).resolves.toBe('dismissed');
    await expect(handle.promptInstall()).resolves.toBe('guidance');
  });

  it('never offers install from a standalone window', () => {
    const { scope, emit } = target({ standalone: true });
    const handle = createInstallHandle(scope);
    emit(promptEvent('accepted'));
    expect(handle.availability()).toBe('installed');
    expect(isStandalone(scope)).toBe(true);
  });

  it('also treats an iOS navigator.standalone window as installed', () => {
    expect(isStandalone(target({ navigatorStandalone: true }).scope)).toBe(true);
  });

  it('flips to installed after an accepted prompt', async () => {
    const { scope, emit } = target();
    const handle = createInstallHandle(scope);
    emit(promptEvent('accepted'));
    await handle.promptInstall();
    expect(handle.availability()).toBe('installed');
  });
});
