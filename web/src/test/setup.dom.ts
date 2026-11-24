// SPDX-License-Identifier: GPL-3.0-only
// jsdom setup loaded before every test file (vitest `setupFiles`). CodeMirror's
// measuring code calls Range.getClientRects, which jsdom does not implement
// (the uncaught rAF-driven measure exception poisoned full runs randomly); a
// no-op stub keeps the editor tests deterministic. Real browsers implement it —
// production measurement is unaffected. Node-environment files have no Range
// and are untouched.
import { beforeEach } from 'vitest';
import { LOCAL_WORKSPACE_KEY } from '../workspace/store/local';

beforeEach(() => {
  // F-10: the shell collapses the code pane below 1440 px (canvas-first). jsdom
  // reports 1024, which would hide the editor from every component test — pin
  // the design width so the chrome under test is the desktop layout.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
  }
  // jsdom keeps Web Storage for the whole file, so the Web Storage workspace
  // backend would carry one test's workspace (and its panel layout) into the
  // next. Every other backend is absent in jsdom and cannot leak like this.
  try {
    globalThis.localStorage?.removeItem(LOCAL_WORKSPACE_KEY);
  } catch {
    // Blocked Web Storage: nothing to isolate.
  }
  const rangeCtor = (globalThis as unknown as { Range?: new () => Range }).Range;
  if (rangeCtor === undefined) return; // node environment — nothing to stub
  const proto = rangeCtor.prototype as unknown as Record<string, unknown>;
  if (typeof proto.getClientRects !== 'function') {
    proto.getClientRects = () => ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    });
  }
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0,
      toJSON: () => ({}),
    });
  }
});
