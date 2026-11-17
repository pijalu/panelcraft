// SPDX-License-Identifier: GPL-3.0-only
// Flow-level notes and current-step prose are separate playback facts. The
// closing text of a flow must not leak back into the step-description slot.
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { useFlowPlayer, type FlowPlayerDeps } from './useFlowPlayer';
import type { Clock } from '../../engine/anim/ports';
import type { BeatCtx } from '../../engine/anim/engine';
import type { Beat } from '../../engine/flows/plan';

const NOTES = '# Checkout\n\n- **Pay** by card\n- [Details](https://example.test/details)';
const DOC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Checkout" as checkout {
  description {
    text "# Checkout"
    text ""
    text "- **Pay** by card"
    text "- [Details](https://example.test/details)"
  }
  presentation
  intro "Start"
  a -> b : "order" presentation {
    description "the order reaches the shop"
  }
  conclusion "Done"
}
`;
const NO_FLAG = DOC.replace('  presentation\n', '');
const LEGACY = `pcd 1.0\nflow "Legacy" as legacy {\n  description "one line"\n  info "start"\n}\n`;

function setup(text: string, flowKey = 'checkout') {
  const clock: Clock = {
    now: () => 0,
    delay: () => 1,
    cancel: () => {},
  };
  const animator = {
    play: (_b: Beat, _c: BeatCtx) => {}, stop: () => {}, pause: () => {}, resume: () => {}, settle: () => {},
  };
  const camera = { focus: () => {}, save: () => {}, restoreSaved: () => {} };
  const deps: FlowPlayerDeps = {
    textOf: (path) => (path === 'f.pcd' ? text : null),
    openFile: () => {},
    animator: animator as never,
    camera: camera as never,
    clock,
    currentViewport: () => ({ x: 0, y: 0, k: 1 }),
  };
  const h = renderHook(() => useFlowPlayer(deps));
  act(() => h.result.current.start('f.pcd', flowKey));
  return h;
}

describe('player separates flow notes from step description', () => {
  it('publishes flow notes and the flag without touching step prose', () => {
    const h = setup(DOC);
    expect(h.result.current.state.flowDescription).toBe(NOTES);
    expect(h.result.current.state.showFlowNotes).toBe(true);
    expect(h.result.current.state.description).toBe('');
    act(() => h.result.current.stepTo(2));
    expect(h.result.current.state.description).toBe('the order reaches the shop');
    expect(h.result.current.state.flowDescription).toBe(NOTES);
  });

  it('keeps flow notes visible at the close without reusing the step field', () => {
    const h = setup(DOC);
    act(() => h.result.current.stepTo(2));
    act(() => h.result.current.stepTo(3));
    expect(h.result.current.state.status).toBe('paused');
    expect(h.result.current.state.description).toBe('');
    expect(h.result.current.state.flowDescription).toBe(NOTES);
    act(() => h.result.current.stepTo(4));
    expect(h.result.current.state.description).toBe('');
    expect(h.result.current.state.flowDescription).toBe(NOTES);
  });

  it('does not show the panel when the flag is absent or notes are empty', () => {
    const h = setup(NO_FLAG);
    expect(h.result.current.state.flowDescription).toBe(NOTES);
    expect(h.result.current.state.showFlowNotes).toBe(false);
    const legacy = setup(LEGACY, 'legacy');
    expect(legacy.result.current.state.flowDescription).toBe('one line');
    expect(legacy.result.current.state.showFlowNotes).toBe(false);
  });
});
