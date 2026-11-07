// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import { UndoStack, ValueChange, UNDO_CAP, COALESCE_WINDOW_MS, type CoalescableCommand } from './undo';

/** Scripted command: appends to a log on undo/redo (observable order). */
function script(
  log: string[],
  label: string,
  opts: { key?: string; coalesce?: (n: CoalescableCommand) => CoalescableCommand | null } = {},
): CoalescableCommand {
  return {
    label,
    coalesceKey: opts.key,
    coalesce: opts.coalesce ?? (() => null),
    undo: () => log.push(`undo:${label}`),
    redo: () => log.push(`redo:${label}`),
  };
}

describe('UndoStack basics (FR-C9)', () => {
  it('push/undo/redo round-trip in LIFO order', () => {
    const log: string[] = [];
    const s = new UndoStack();
    s.push(script(log, 'a'));
    s.push(script(log, 'b'));
    expect(s.size).toBe(2);
    expect(s.undo()).toBe('b');
    expect(s.undo()).toBe('a');
    expect(log).toEqual(['undo:b', 'undo:a']);
    expect(s.redo()).toBe('a');
    expect(s.redo()).toBe('b');
    expect(log).toEqual(['undo:b', 'undo:a', 'redo:a', 'redo:b']);
  });

  it('canUndo/canRedo flags track state', () => {
    const s = new UndoStack();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    s.push(script([], 'a'));
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(true);
    s.redo();
    expect(s.canRedo).toBe(false);
  });

  it('new push clears the redo tail', () => {
    const s = new UndoStack();
    s.push(script([], 'a'));
    s.push(script([], 'b'));
    s.undo(); // redo tail: [a]
    s.push(script([], 'c'));
    expect(s.canRedo).toBe(false);
    expect(s.size).toBe(2); // a, c
    expect(s.undo()).toBe('c');
    expect(s.undo()).toBe('a');
  });

  it('caps at UNDO_CAP steps (oldest dropped)', () => {
    const s = new UndoStack();
    for (let i = 0; i < UNDO_CAP + 20; i++) s.push(script([], `c${i}`));
    expect(s.size).toBe(UNDO_CAP);
    // oldest 20 dropped: top is the last pushed
    expect(s.undo()).toBe(`c${UNDO_CAP + 19}`);
    expect(s.undo()).toBe(`c${UNDO_CAP + 18}`);
  });

  it('clear resets everything', () => {
    const s = new UndoStack();
    s.push(script([], 'a'));
    s.undo();
    s.clear();
    expect(s.size).toBe(0);
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
  });
});

describe('coalescing (FR-C9 drag/typing)', () => {
  it('same key within window merges into top (no new entry)', () => {
    let t = 0;
    const s = new UndoStack(() => t);
    const log: string[] = [];
    const merged: CoalescableCommand[] = [];
    s.push(
      script(log, 'drag', {
        key: 'drag:a',
        coalesce: (n) => {
          merged.push(n);
          return script(log, 'drag*', { key: 'drag:a', coalesce: (m) => (merged.push(m), script(log, 'drag*', { key: 'drag:a' })) });
        },
      }),
    );
    t = 500;
    s.push(script(log, 'move1', { key: 'drag:a' }));
    expect(s.size).toBe(1);
    expect(merged).toHaveLength(1);
    expect(log).toEqual([]); // nothing executed yet
  });

  it('window expiry keeps entries separate', () => {
    let t = 0;
    const s = new UndoStack(() => t);
    s.push(script([], 'a', { key: 'k' }));
    t = COALESCE_WINDOW_MS + 1;
    s.push(script([], 'b', { key: 'k' }));
    expect(s.size).toBe(2);
  });

  it('different keys never merge', () => {
    const s = new UndoStack(() => 0);
    s.push(script([], 'a', { key: 'name' }));
    s.push(script([], 'b', { key: 'pos' }));
    expect(s.size).toBe(2);
  });

  it('keyless commands never merge', () => {
    const s = new UndoStack(() => 0);
    s.push(script([], 'a'));
    s.push(script([], 'b'));
    expect(s.size).toBe(2);
  });

  it('coalesce returning null falls through to a new entry', () => {
    const s = new UndoStack(() => 0);
    s.push(script([], 'a', { key: 'k', coalesce: () => null }));
    s.push(script([], 'b', { key: 'k' }));
    expect(s.size).toBe(2);
  });

  it('undo/redo breaks a coalescing run', () => {
    let t = 0;
    const s = new UndoStack(() => t);
    const log: string[] = [];
    // proper merge: absorbs the next command into a combined label
    s.push(
      script(log, 'a', {
        key: 'k',
        coalesce: (n) => script(log, `a+${n.label}`, { key: 'k' }),
      }),
    );
    s.push(script(log, 'm1', { key: 'k' }));
    expect(s.size).toBe(1); // merged
    s.undo();
    t = 10; // within window, but undo reset lastPushAt
    s.push(script(log, 'm2', { key: 'k' }));
    // new work clears the redo tail (FR-C9 semantics): nothing stale survives
    expect(s.size).toBe(1);
    expect(s.canRedo).toBe(false);
    expect(s.undo()).toBe('m2');
    expect(s.redo()).toBe('m2');
    expect(s.canRedo).toBe(false);
  });

  it('topKey exposes the top command key', () => {
    const s = new UndoStack(() => 0);
    s.push(script([], 'a', { key: 'name:x' }));
    expect(s.topKey).toBe('name:x');
    s.push(script([], 'b', { key: 'pos:x' }));
    expect(s.topKey).toBe('pos:x');
  });
});

describe('ValueChange (properties/typing coalescing)', () => {
  it('apply() runs the set immediately; undo restores before', () => {
    let v = 'orig';
    const cmd = ValueChange.apply<string>(
      (nv) => (v = nv),
      'orig',
      'first',
      'name:o1',
      'rename',
    );
    expect(v).toBe('first');
    cmd.undo();
    expect(v).toBe('orig');
    cmd.redo();
    expect(v).toBe('first');
  });

  it('typing run merges: undo jumps to original, redo to latest', () => {
    let v = '';
    let t = 0;
    const s = new UndoStack(() => t);
    const type = (text: string) =>
      s.push(ValueChange.apply<string>((nv) => (v = nv), v, text, 'name:o1', 'rename'));
    type('P'); // before: ''
    t = 100;
    type('Pa'); // before: 'P' (== current after) → merge
    t = 200;
    type('Pan'); // merge again
    expect(s.size).toBe(1);
    expect(v).toBe('Pan');
    s.undo();
    expect(v).toBe(''); // single undo to pre-typing value
    s.redo();
    expect(v).toBe('Pan');
  });

  it('stale command (state moved underneath) does not merge', () => {
    let v = 'x';
    const s = new UndoStack(() => 0);
    const type = (text: string) =>
      s.push(ValueChange.apply<string>((nv) => (v = nv), v, text, 'name:o1'));
    type('y'); // x→y
    v = 'interfered'; // external write breaks the chain
    type('z'); // before 'interfered' ≠ after 'y' → separate entry
    expect(s.size).toBe(2);
  });

  it('drag run: positional moves coalesce to one undo step', () => {
    let pos = { x: 0, y: 0 };
    let t = 0;
    const s = new UndoStack(() => t);
    const posEq = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x === b.x && a.y === b.y;
    const move = (x: number, y: number) =>
      s.push(
        ValueChange.apply<{ x: number; y: number }>(
          (p) => (pos = { ...p }),
          pos,
          { x, y },
          'move:o1',
          'drag',
          posEq,
        ),
      );
    move(8, 0);
    t = 50;
    move(16, 0);
    t = 100;
    move(24, 4);
    expect(s.size).toBe(1);
    expect(pos).toEqual({ x: 24, y: 4 });
    s.undo();
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it('merge rejects non-ValueChange commands', () => {
    const set = (_v: string) => {};
    const a = new ValueChange<string>(set, 'a', 'b', 'k');
    const foreign: CoalescableCommand = script([], 'c', { key: 'k' });
    expect(a.coalesce(foreign)).toBeNull();
  });
});
