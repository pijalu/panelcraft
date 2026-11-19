// SPDX-License-Identifier: GPL-3.0-only
// One editing session per file: two surfaces share a pending buffer, so a second
// edit cannot be built on text the first one has not applied yet.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { flowSessionText, useFlowSession } from './flowSession';

const DOC = `pcd 1.0

person a "Ada"

flow "Main" as main {
  intro "start"
}
`;

describe('flow session source selection', () => {
  it('does not replace a clean file with an older empty code projection', () => {
    expect(flowSessionText(DOC, { state: 'clean', codeText: 'pcd 1.0\n' })).toBe(DOC);
  });

  it('uses the code buffer while an edit or undo is still in flight', () => {
    const edited = `${DOC}container shop "Shop"\n`;
    expect(flowSessionText(DOC, { state: 'editing', codeText: edited })).toBe(edited);
    expect(flowSessionText(DOC, { state: 'pending-apply', codeText: edited })).toBe(edited);
  });
});

describe('useFlowSession', () => {
  it('builds each edit on the previous result, not on unapplied text', () => {
    const written: string[] = [];
    const { result } = renderHook(() => useFlowSession(DOC, 1, (next) => written.push(next)));
    act(() => {
      result.current.apply((doc) => {
        doc.flows[0]!.steps[0] = { ...doc.flows[0]!.steps[0]!, text: 'first' } as never;
      });
      // The shell has not re-rendered with the new text yet: the session must
      // still see its own last write.
      result.current.apply((doc) => {
        doc.flows[0]!.steps[0] = { ...doc.flows[0]!.steps[0]!, text: 'second' } as never;
      });
    });
    expect(written).toHaveLength(2);
    expect(written[1]).toContain('second');
    // Both edits survive: the first is the base of the second.
    expect(written[1]).not.toContain('first');
  });

  it('adopts the file again when the workspace emits a new version', () => {
    let version = 1;
    const written: string[] = [];
    const { result, rerender } = renderHook(() =>
      useFlowSession(DOC, version, (next) => written.push(next)),
    );
    act(() => {
      result.current.apply(() => {
        // no-op edit: the session now holds freshly printed text
      });
    });
    expect(written).toHaveLength(1);
    // Undo in the shell replaces the document; the next edit must start from it.
    version = 2;
    rerender();
    act(() => {
      result.current.apply((doc) => {
        doc.flows[0]!.title = 'Renamed';
      });
    });
    expect(written[1]).toContain('flow "Renamed"');
    expect(written[1]).toContain('intro "start"');
  });

  it('rebases a flow edit on newer canvas text even before the workspace version changes', () => {
    let text = DOC;
    const written: string[] = [];
    const { result, rerender } = renderHook(() =>
      useFlowSession(text, 1, (next) => written.push(next)),
    );
    text = DOC.replace('person a "Ada"', 'person a "Ada"\ncontainer shop "Shop"');
    rerender();
    act(() => {
      result.current.apply((doc) => {
        doc.flows[0]!.title = 'After canvas edit';
      });
    });
    expect(written[0]).toContain('flow "After canvas edit"');
    expect(written[0]).toContain('container shop "Shop"');
  });

  it('keeps an unapplied flow edit when newer canvas source arrives', () => {
    let text = DOC;
    const written: string[] = [];
    const { result, rerender } = renderHook(() =>
      useFlowSession(text, 1, (next) => written.push(next)),
    );
    act(() => {
      result.current.apply((doc) => {
        doc.flows[0]!.steps[0] = { ...doc.flows[0]!.steps[0]!, text: 'first' } as never;
      });
    });
    text = DOC.replace('person a "Ada"', 'person a "Ada"\ncontainer shop "Shop"');
    rerender();
    expect(result.current.read()).toContain('container shop "Shop"');
    expect(result.current.read()).toContain('intro "first"');
    act(() => {
      result.current.apply((doc) => {
        doc.flows[0]!.steps[0] = { ...doc.flows[0]!.steps[0]!, text: 'second' } as never;
      });
    });
    expect(written.at(-1)).toContain('container shop "Shop"');
    expect(written.at(-1)).toContain('intro "second"');
  });

  it('accepts an authoritative undo instead of resurrecting a pending flow edit', () => {
    let text = DOC;
    const written: string[] = [];
    const { result, rerender } = renderHook(() =>
      useFlowSession(text, 1, (next) => written.push(next)),
    );
    act(() => {
      result.current.apply((doc) => {
        doc.flows[0]!.steps[0] = { ...doc.flows[0]!.steps[0]!, text: 'changed' } as never;
      });
    });
    text = written[0]!;
    rerender();
    // The shell has applied the local write; undo now restores the old flow.
    text = DOC;
    rerender();
    expect(result.current.read()).toBe(DOC);
  });

  it('writes nothing for a document that does not parse', () => {
    const written: string[] = [];
    const { result } = renderHook(() => useFlowSession('pcd 1.0\n !!! nonsense', 1, (next) => written.push(next)));
    act(() => {
      result.current.apply((doc) => {
        doc.flows = [];
      });
    });
    expect(written).toEqual([]);
  });
});
