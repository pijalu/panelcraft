// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP08: an “inspect this” gesture must select the entity, bring a closed or
// collapsed Properties panel back, and land focus in its first useful field
// without touching the existing value.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/preact';
import type { CanvasController } from './CanvasController';
import { usePropertiesRequest } from './usePropertiesRequest';

function harness(initialKey = 'a1|') {
  const input = document.createElement('input');
  input.value = 'existing label';
  document.body.appendChild(input);
  const ctrl = {
    setSelection: vi.fn(),
  } as unknown as CanvasController;
  const openPanel = vi.fn();
  const nameFieldRef = { current: null as HTMLInputElement | null };
  const linkLabelRef = { current: null as HTMLInputElement | null };
  const props = (selectionKey: string) => ({
    ctrlRef: { current: ctrl },
    openPanel,
    nameFieldRef,
    selectionKey,
  });
  const hook = renderHook(
    (p: { selectionKey: string }) => usePropertiesRequest(props(p.selectionKey)),
    { initialProps: { selectionKey: initialKey } },
  );
  return { ctrl, openPanel, hook, input, nameFieldRef, linkLabelRef };
}

describe('usePropertiesRequest (UX08-WP08)', () => {
  it('selects exactly one link, opens Properties and focuses its Label field', () => {
    const h = harness();
    h.hook.result.current.linkLabelRef.current = h.input;
    act(() => h.hook.result.current.request({ kind: 'link', id: 'l1' }));
    expect((h.ctrl.setSelection as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [[], ['l1']],
    ]);
    expect(h.openPanel).toHaveBeenCalledWith('props');
    // The focus effect ran after the selection reached the panel.
    expect(document.activeElement).toBe(h.input);
    // Focusing must not select or clear what the user already wrote.
    expect(h.input.value).toBe('existing label');
    expect(h.input.selectionEnd).toBe('existing label'.length);
  });

  it('selects exactly one object and focuses the Name field instead', () => {
    const h = harness('o1|');
    const name = document.createElement('input');
    document.body.appendChild(name);
    h.nameFieldRef.current = name;
    act(() => h.hook.result.current.request({ kind: 'object', id: 'o1' }));
    expect((h.ctrl.setSelection as unknown as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [['o1'], []],
    ]);
    expect(document.activeElement).toBe(name);
  });

  it('retries focus once a reopened panel has rendered its field', () => {
    const h = harness();
    // Collapsed panel: the request lands while the field is still absent.
    act(() => h.hook.result.current.request({ kind: 'link', id: 'l3' }));
    expect(h.openPanel).toHaveBeenCalledWith('props');
    expect(document.activeElement).not.toBe(h.input);
    // Panel now open: its Label field mounted, and the selection change re-runs
    // the focus effect instead of dropping the request.
    h.hook.result.current.linkLabelRef.current = h.input;
    act(() => h.hook.rerender({ selectionKey: '|l3' }));
    expect(document.activeElement).toBe(h.input);
  });

  it('is a no-op without a live controller (panel never opens on a dead canvas)', () => {
    const openPanel = vi.fn();
    const { result } = renderHook(() => usePropertiesRequest({
      ctrlRef: { current: null },
      openPanel,
      nameFieldRef: { current: null },
      selectionKey: '',
    }));
    act(() => result.current.request({ kind: 'link', id: 'l1' }));
    expect(openPanel).not.toHaveBeenCalled();
  });
});
