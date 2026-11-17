// SPDX-License-Identifier: GPL-3.0-only
// What the Properties panel shows, and the rule that keeps the canvas and a flow
// step from both owning it.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import type { DiagramLink, DiagramObject } from '../CanvasController';
import { propTarget } from './flowTargets';
import { useFlowEditing } from './useFlowEditing';
import { parseForEditor } from './flowSession';

const DOC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start"
  a -> b : "order"
}
`;

const doc = parseForEditor(DOC)!;
const object = { id: 'a', kind: 'person', w: 10, h: 10 } as DiagramObject;
const link = { id: 'ab', from: 'a', to: 'b' } as DiagramLink;

describe('propTarget', () => {
  it('keeps the chosen step while the canvas reloads a selection underneath', () => {
    // Editing a step rewrites the file, the canvas reloads and may re-select the
    // connector; the panel must not swap the field out from under the typist.
    const target = propTarget({ object, link, doc, selection: { flow: 'main', step: [1] } });
    expect(target.kind).toBe('flow');
  });

  it('shows the canvas selection when no flow is chosen', () => {
    const target = propTarget({ object, link, doc, selection: null });
    expect(target.kind).toBe('object');
  });

  it('shows the flow step when the canvas is empty', () => {
    const target = propTarget({ object: null, link: null, doc, selection: { flow: 'main', step: [1] } });
    expect(target.kind).toBe('flow');
    if (target.kind !== 'flow') return;
    expect(target.target.step?.type).toBe('msg');
    expect(target.target.flow.title).toBe('Main');
  });

  it('shows the flow itself for a flow-level selection', () => {
    const target = propTarget({ object: null, link: null, doc, selection: { flow: 'main', step: [] } });
    expect(target.kind).toBe('flow');
    if (target.kind !== 'flow') return;
    expect(target.target.step).toBeNull();
  });

  it('falls back to the empty state when nothing is selected', () => {
    expect(propTarget({ object: null, link: null, doc, selection: null }).kind).toBe('none');
  });
});

describe('useFlowEditing', () => {
  it('drops the canvas selection when a step is chosen', () => {
    const clearCanvas = vi.fn();
    const setSelection = vi.fn();
    const { result } = renderHook(() =>
      useFlowEditing({
        text: DOC,
        version: 1,
        onChangeText: () => {},
        setSelection,
        clearCanvasSelection: clearCanvas,
      }),
    );
    act(() => result.current.selectFlow({ flow: 'main', step: [1] }));
    expect(setSelection).toHaveBeenCalledWith({ flow: 'main', step: [1] });
    expect(clearCanvas).toHaveBeenCalledTimes(1);
  });

  it('leaves the canvas alone when only a flow is chosen', () => {
    const clearCanvas = vi.fn();
    const { result } = renderHook(() =>
      useFlowEditing({
        text: DOC,
        version: 1,
        onChangeText: () => {},
        setSelection: () => {},
        clearCanvasSelection: clearCanvas,
      }),
    );
    act(() => result.current.selectFlow({ flow: 'main', step: [] }));
    expect(clearCanvas).not.toHaveBeenCalled();
  });

  it('writes through one session', () => {
    const written: string[] = [];
    const { result } = renderHook(() =>
      useFlowEditing({
        text: DOC,
        version: 1,
        onChangeText: (next) => written.push(next),
        setSelection: () => {},
        clearCanvasSelection: () => {},
      }),
    );
    act(() =>
      result.current.session.apply((doc) => {
        doc.flows[0]!.title = 'Renamed';
      }),
    );
    expect(written[0]).toContain('flow "Renamed"');
  });
});
