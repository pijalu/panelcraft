// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// CodeEditor component tests (M4-WP1/WP3) — jsdom: CM mount, editor→machine
// wiring (typing → textChanged → idle apply), machine→editor buffer writes,
// problems panel rendering, and the line:col → offset mapping unit table.
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { EditorView } from '@codemirror/view';
import { CodeEditor, posToOffset } from './CodeEditor';
import { createSyncMachine, type SyncMachine } from './sync';
import type { Doc } from '../../engine/model/types';

const PDL = 'pcd 1.0\n\nsystem a "A" {\n}\n';

// CodeMirror measures the host; give jsdom a stable geometry.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) };
    },
  });
});
afterEach(cleanup);

/** Test machine: synchronous scheduler (idle parse runs inline) + captures. */
function makeMachine(initial = PDL): { machine: SyncMachine; applied: Doc[] } {
  const applied: Doc[] = [];
  const machine = createSyncMachine({
    schedule: (fn) => {
      fn(); // immediate: timers fire synchronously in tests
      return 0;
    },
    cancel: () => {},
    apply: (doc) => applied.push(doc),
  });
  machine.loadFile(initial);
  return { machine, applied };
}

/** Replace the whole editor buffer the way real edits do (via the CM view). */
function setBuffer(text: string): void {
  const host = document.querySelector('.cm-editor');
  const view = EditorView.findFromDOM(host as HTMLElement);
  if (!view) throw new Error('no EditorView in DOM');
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
}

describe('posToOffset (WP3 line:col → offset)', () => {
  const text = 'ab\ncdef\n\ngh';
  it('maps 1-based line/col onto string offsets', () => {
    expect(posToOffset(text, 1, 1)).toBe(0);
    expect(posToOffset(text, 1, 3)).toBe(2);
    expect(posToOffset(text, 2, 1)).toBe(3);
    expect(posToOffset(text, 2, 3)).toBe(5);
    expect(posToOffset(text, 4, 1)).toBe(9); // 'gh' starts at 9 (two \n before)
  });
  it('clamps out-of-range cols to line end and lines to last line', () => {
    expect(posToOffset(text, 2, 99)).toBe(7); // end of "cdef"
    expect(posToOffset(text, 99, 1)).toBe(12); // end of text
    expect(posToOffset(text, 0, 0)).toBe(0);
  });
});

describe('CodeEditor', () => {
  it('mounts a CodeMirror view showing the machine buffer', () => {
    const { machine } = makeMachine(PDL);
    render(<CodeEditor machine={machine} />);
    expect(document.querySelector('.cm-editor')).not.toBeNull();
    expect(document.querySelector('.cm-content')?.textContent).toContain('system a');
    expect(document.querySelector('[data-testid="code-view"]')).not.toBeNull();
    expect(document.querySelector('[data-sync-state="clean"]')).not.toBeNull();
  });

  it('typing feeds machine.textChanged; valid text applies to the canvas', () => {
    const { machine, applied } = makeMachine(PDL);
    render(<CodeEditor machine={machine} />);
    setBuffer('pcd 1.0\n\nsystem b "B" {\n}\n');
    // synchronous test scheduler: idle parse already ran
    expect(applied).toHaveLength(1);
    expect(machine.snapshot().state).toBe('pending-apply');
  });

  it('typing broken text surfaces diagnostics in the problems panel (FR-K3)', () => {
    const { machine } = makeMachine(PDL);
    render(<CodeEditor machine={machine} />);
    setBuffer('pcd 1.0\nsystem');
    expect(machine.snapshot().state).toBe('error');
    expect(document.querySelector('[data-testid="problems"]')).not.toBeNull();
    // the buffer itself is never replaced with an error (FR-K3)
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
    expect(view.state.doc.toString()).toBe('pcd 1.0\nsystem');
  });

  it('renders an empty problems area while clean', () => {
    const { machine } = makeMachine(PDL);
    render(<CodeEditor machine={machine} />);
    expect(document.querySelector('[data-testid="problems-empty"]')).not.toBeNull();
  });

  it('machine buffer writes reach the editor (canvas render → code view)', () => {
    const { machine } = makeMachine(PDL);
    render(<CodeEditor machine={machine} />);
    // simulate a canvas change arriving at the machine (as the App bridge does)
    act(() => {
      machine.canvasChanged({
        irVersion: 1,
        formatVersion: '1.0',
        imports: [],
        objects: [{ kind: 'person', id: 'p1', name: 'Pat', pos: { line: 0, col: 0 } }],
        links: [],
        flows: [],
        views: [],
        styles: [],
      });
    });
    // with the synchronous scheduler the debounced render already landed
    expect(document.querySelector('.cm-content')?.textContent).toContain('Pat');
  });
});
