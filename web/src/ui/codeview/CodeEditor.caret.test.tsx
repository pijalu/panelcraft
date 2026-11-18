// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// F-03/F-04 regression suite: a machine→editor write must not move the caret
// and must not canonicalise the buffer under it.
//
// Before the fix, `CodeEditor` dispatched `{from: 0, to: doc.length}` on every
// machine write, so a selection at offset 12 collapsed to 0 (review §2 D4), and
// `SyncMachine.applied()` replaced the typed buffer with the canonical print
// (review §2 D3).

import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { EditorView } from '@codemirror/view';
import { CodeEditor } from './CodeEditor';
import { createSyncMachine, type SyncMachine } from './sync';
import type { Doc } from '../../engine/model/types';

// canonical print (F-05: no empty attribute blocks, no blank line between
// statements of the same section)
const PDL = 'pcd 1.0\n\nsystem a "A"\nsystem b "B"\n';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) };
    },
  });
});
afterEach(cleanup);

function makeMachine(initial = PDL): { machine: SyncMachine; applied: Doc[] } {
  const applied: Doc[] = [];
  const machine = createSyncMachine({
    schedule: (fn) => {
      fn();
      return 0;
    },
    cancel: () => {},
    apply: (doc) => applied.push(doc),
  });
  machine.loadFile(initial);
  return { machine, applied };
}

const view = (): EditorView => {
  const v = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
  if (!v) throw new Error('no EditorView');
  return v;
};

const docOf = (objects: Array<[string, string]>) => ({
  irVersion: 1,
  formatVersion: '1.0',
  icons: [],
  imports: [],
  objects: objects.map(([id, name]) => ({
    kind: 'system' as const,
    id,
    name,
    pos: { line: 0, col: 0 },
  })),
  links: [],
  flows: [],
  styles: [],
});

describe('caret preservation on machine writes (F-03)', () => {
  it('a canvas write keeps the caret at the same logical position', () => {
    const { machine } = makeMachine();
    render(<CodeEditor machine={machine} />);
    const head = PDL.indexOf('system b');
    act(() => {
      view().dispatch({ selection: { anchor: head } });
    });
    expect(view().state.selection.main.head).toBe(head);

    act(() => {
      machine.canvasChanged(docOf([['a', 'A'], ['b', 'B'], ['c', 'C']]));
    });

    // the incoming text is appended after the caret, so the caret must not move
    expect(view().state.doc.toString()).toContain('system c "C"');
    expect(view().state.selection.main.head).toBe(head);
  });

  it('a rename elsewhere in the document does not reset the caret to offset 0', () => {
    const { machine } = makeMachine();
    render(<CodeEditor machine={machine} />);
    const anchor = PDL.indexOf('system b');
    act(() => {
      view().dispatch({ selection: { anchor } });
    });
    act(() => {
      machine.canvasChanged(docOf([['a', 'Renamed'], ['b', 'B']]));
    });
    const head = view().state.selection.main.head;
    expect(head).toBeGreaterThan(0);
    // same line, still inside the second object statement
    const line = view().state.doc.lineAt(head);
    expect(line.text).toContain('system b');
  });

  it('skips the dispatch when only trailing whitespace differs', () => {
    const { machine } = makeMachine('pcd 1.0\n\nsystem a "A"\n');
    render(<CodeEditor machine={machine} />);
    const before = view().state.doc.toString();
    act(() => {
      machine.canvasChanged(docOf([['a', 'A']]));
    });
    // identical content (the machine print has no trailing blank line): no diff
    expect(view().state.doc.toString().trimEnd()).toBe(before.trimEnd());
  });
});

describe('machine writes are not user edits (F-30)', () => {
  it('a projected canvas render does not put the machine into editing', () => {
    const { machine } = makeMachine();
    render(<CodeEditor machine={machine} />);
    act(() => {
      machine.canvasChanged(docOf([['a', 'A'], ['b', 'B'], ['c', 'C']]));
    });
    // the render reached the buffer …
    expect(view().state.doc.toString()).toContain('system c "C"');
    // … without the editor claiming the user typed (which armed a parse and
    // could surface a bogus error state mid-render)
    expect(machine.snapshot().state).toBe('clean');
  });
});

describe('no canonicalisation under the caret (F-04)', () => {
  it('an idle apply leaves the typed buffer verbatim', () => {
    const { machine, applied } = makeMachine('pcd 1.0\n');
    render(<CodeEditor machine={machine} />);
    const typed = 'pcd 1.0\n\nsystem   z   "Z"\n';
    act(() => {
      view().dispatch({ changes: { from: 0, to: view().state.doc.length, insert: typed } });
    });
    // the synchronous scheduler already ran the idle parse + apply
    expect(applied).toHaveLength(1);
    expect(view().state.doc.toString()).toBe(typed);
    expect(machine.snapshot().codeText).toBe(typed);
  });

  it('format (Shift-Alt-f) is the explicit canonicalisation path', () => {
    const { machine } = makeMachine('pcd 1.0\n');
    render(<CodeEditor machine={machine} />);
    act(() => {
      view().dispatch({
        changes: { from: 0, to: view().state.doc.length, insert: 'pcd 1.0\nsystem   z   "Z"\n' },
      });
    });
    act(() => {
      machine.formatNow();
    });
    expect(view().state.doc.toString()).toBe('pcd 1.0\n\nsystem z "Z"\n');
  });
});
