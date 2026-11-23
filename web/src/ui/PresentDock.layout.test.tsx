// SPDX-License-Identifier: GPL-3.0-only
// The dock is content-sized, so its measured border box is the single bottom
// reservation for presentation. This unit suite pins observer/refit behavior;
// real bounds and safe-area geometry live in the Chromium regression.
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentDock } from './PresentDock';
import { FRESH } from './flows/flowController';
import type { FlowPlayerApi } from './flows/useFlowPlayer';

const HEIGHT_VAR = '--present-dock-height';

function player(): FlowPlayerApi {
  return {
    state: { ...FRESH, status: 'paused', narration: 'wrapped narration', progress: { index: 1, total: 2 } },
    start: vi.fn(), exit: vi.fn(), pause: vi.fn(), resume: vi.fn(), replay: vi.fn(),
    restart: vi.fn(), stepTo: vi.fn(), playFrom: vi.fn(), choose: vi.fn(), refit: vi.fn(),
    setRectProvider: vi.fn(),
  } as unknown as FlowPlayerApi;
}

describe('presentation dock measurement', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty(HEIGHT_VAR);
  });

  it('publishes the border-box height, refits on resize and cleans up', async () => {
    let height = 132;
    let frame: FrameRequestCallback | undefined;
    let resize = (): void => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frame = undefined;
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        resize = () => callback([], this as unknown as ResizeObserver);
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 360, bottom: height,
        width: 360, height, toJSON: () => ({}),
      } as DOMRect;
    });

    const p = player();
    const view = render(<PresentDock player={p} />);
    await vi.waitFor(() => expect(observe).toHaveBeenCalledWith(screen.getByTestId('present-dock'), { box: 'border-box' }));
    expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('132px');
    expect(frame).toBeDefined();
    frame?.(0);
    expect(p.refit).toHaveBeenCalledTimes(1);

    height = 217;
    resize();
    expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('217px');
    frame?.(0);
    expect(p.refit).toHaveBeenCalledTimes(2);

    view.unmount();
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
    expect(document.documentElement.style.getPropertyValue(HEIGHT_VAR)).toBe('');
  });
});
