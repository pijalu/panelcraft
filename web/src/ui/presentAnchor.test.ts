// SPDX-License-Identifier: GPL-3.0-only
// Presentation URL anchor — regression tests. Before the fix there was no hash
// codec, no history port and no transition table, so this suite failed to load.
// These cases are the contract for direct load, reload, Back/Forward, explicit
// Present, natural end, exit, external file switch and cross-file goto.
import { describe, expect, it } from 'vitest';
import {
  anchorTransition,
  INITIAL_ANCHOR,
  presentHash,
  readPresentId,
  type AnchorEvent,
  type AnchorState,
  type PresentHistoryPort,
  type PresentStatus,
} from './presentAnchor';

const ID = 'checkout-flow';

/** Minimal fake history: writes are silent (as pushState/replaceState are in a
 * browser); `navigate` models a real Back/Forward or a typed URL — it only
 * changes `current` and notifies subscribers. */
function fakeHistory(initial = ''): PresentHistoryPort & {
  navigate(hash: string): void;
  writes(): Array<{ op: 'push' | 'replace'; hash: string }>;
} {
  let current = initial;
  let listeners: Array<(hash: string) => void> = [];
  const writes: Array<{ op: 'push' | 'replace'; hash: string }> = [];
  return {
    current: () => current,
    push(hash) {
      writes.push({ op: 'push', hash });
      current = hash;
    },
    replace(hash) {
      writes.push({ op: 'replace', hash });
      current = hash;
    },
    subscribe(cb) {
      listeners = [...listeners, cb];
      return () => {
        listeners = listeners.filter((x) => x !== cb);
      };
    },
    navigate(hash) {
      current = hash;
      for (const cb of listeners) cb(hash);
    },
    writes: () => writes,
  };
}

interface Result {
  state: AnchorState;
  started: string[];
  exited: number;
  history: Array<{ op: 'push' | 'replace'; hash: string }>;
}

/** Run one transition through a fake history and recording player ports. */
function apply(
  state: AnchorState,
  event: AnchorEvent,
  history: PresentHistoryPort & { writes(): Array<{ op: 'push' | 'replace'; hash: string }> },
  authored: (id: string) => boolean = (id) => id === ID,
): Result {
  const before = history.writes().length;
  const next = anchorTransition(state, event, authored);
  const started: string[] = [];
  let exited = 0;
  if (next.effects.start !== undefined) started.push(next.effects.start);
  if (next.effects.exit === true) exited += 1;
  if (next.effects.write !== undefined) {
    if (next.effects.write.op === 'push') history.push(next.effects.write.hash);
    else history.replace(next.effects.write.hash);
  }
  return { state: next.state, started, exited, history: history.writes().slice(before) };
}

const event = {
  ready: (hash: string, path: string | null = 'untitled.pcd'): AnchorEvent => ({ type: 'ready', hash, path }),
  hash: (hash: string): AnchorEvent => ({ type: 'hash', hash }),
  present: (flowId: string | null): AnchorEvent => ({ type: 'present', flowId }),
  status: (status: PresentStatus): AnchorEvent => ({ type: 'status', status }),
  file: (path: string | null, hash = ''): AnchorEvent => ({ type: 'file', path, hash }),
};

describe('present hash codec', () => {
  it('round-trips plain, spaced, unicode and delimiter-bearing ids', () => {
    for (const id of [ID, 'checkout flow', '检查/流程', 'a&b=c#d%e', "quotes'()*!~", '_ . -']) {
      const hash = presentHash(id);
      expect(hash.startsWith('#present=')).toBe(true);
      expect(hash).not.toContain(' ');
      expect(readPresentId(hash)).toBe(id);
    }
  });

  it('rejects empty, malformed, multi-key and foreign anchors', () => {
    for (const hash of [
      '',
      '#',
      '#present',
      '#present=',
      '#present=%ZZ',
      '#present=%E0%A4%A',
      '#present=a&view=b',
      '#present=a=b',
      '#present=a#b',
      '#present=a b',
      `#present=${'x'.repeat(257)}`,
    ]) {
      expect(readPresentId(hash), hash).toBeNull();
    }
  });

  it('leaves foreign anchors alone — no #view anchor is introduced or owned', () => {
    expect(readPresentId('#view=main')).toBeNull();
    const h = fakeHistory('#view=main');
    const r = apply(INITIAL_ANCHOR, event.ready(h.current()), h);
    expect(r.started).toEqual([]);
    expect(r.history).toEqual([]);
  });

  it('never accepts a control character in an id', () => {
    expect(readPresentId(`#present=${encodeURIComponent('a\u0000b')}`)).toBeNull();
  });
});

describe('presentation anchor transition table', () => {
  it('direct load: a valid id starts once the workspace is ready, without a history write', () => {
    const h = fakeHistory(presentHash(ID));
    const r = apply(INITIAL_ANCHOR, event.ready(h.current()), h);
    expect(r.started).toEqual([ID]);
    expect(r.history).toEqual([]);
    expect(r.state.runningId).toBe(ID);
  });

  it('direct load: an unknown or malformed id clears the anchor and starts nothing', () => {
    for (const hash of [presentHash('nope'), '#present=%ZZ']) {
      const h = fakeHistory(hash);
      const r = apply(INITIAL_ANCHOR, event.ready(hash), h);
      expect(r.started).toEqual([]);
      expect(r.history).toEqual([{ op: 'replace', hash: '' }]);
    }
  });

  it('reload starts again from a fresh state with the same hash', () => {
    const h = fakeHistory(presentHash(ID));
    const first = apply(INITIAL_ANCHOR, event.ready(h.current()), h);
    const reloaded = apply(INITIAL_ANCHOR, event.ready(h.current()), h);
    expect(first.started).toEqual([ID]);
    expect(reloaded.started).toEqual([ID]);
  });

  it('Back out of a presentation exits; Forward starts it again', () => {
    const h = fakeHistory();
    let s = apply(INITIAL_ANCHOR, event.ready(''), h).state;
    s = apply(s, event.present(ID), h).state;
    expect(h.writes()).toEqual([{ op: 'push', hash: presentHash(ID) }]);
    s = apply(s, event.status('playing'), h).state;

    h.navigate('');
    const back = apply(s, event.hash(h.current()), h);
    expect(back.exited).toBe(1);
    expect(back.history).toEqual([]);
    expect(back.state.runningId).toBeNull();

    h.navigate(presentHash(ID));
    const fwd = apply(back.state, event.hash(h.current()), h);
    expect(fwd.started).toEqual([ID]);
    expect(fwd.history).toEqual([]);
  });

  it('Back immediately after a hash-originated start still exits (status event has not arrived)', () => {
    const h = fakeHistory(presentHash(ID));
    // `ready` adopts the flow; the runner's 'playing' status event is late.
    const ready = apply(INITIAL_ANCHOR, event.ready(h.current()), h);
    expect(ready.started).toEqual([ID]);
    h.navigate('');
    const back = apply(ready.state, event.hash(h.current()), h);
    expect(back.exited).toBe(1);
    expect(back.history).toEqual([]); // Back already removed the anchor
  });

  it('a repeated hash event for the running flow is a no-op (no feedback loop)', () => {
    const h = fakeHistory(presentHash(ID));
    let s = apply(INITIAL_ANCHOR, event.ready(h.current()), h).state;
    s = apply(s, event.status('playing'), h).state;
    const again = apply(s, event.hash(h.current()), h);
    expect(again.started).toEqual([]);
    expect(again.history).toEqual([]);
  });

  it('explicit Present pushes a new entry; a flow without an authored id writes none', () => {
    const h = fakeHistory();
    const anchored = apply(INITIAL_ANCHOR, event.present(ID), h);
    expect(anchored.history).toEqual([{ op: 'push', hash: presentHash(ID) }]);
    const h2 = fakeHistory();
    const local = apply(INITIAL_ANCHOR, event.present(null), h2);
    expect(local.history).toEqual([]);
    expect(local.state.runningId).toBeNull();
  });

  it('natural end and explicit exit clear the anchor with replace, never push', () => {
    for (const status of ['ended', 'idle'] as const) {
      const h = fakeHistory(presentHash(ID));
      let s = apply(INITIAL_ANCHOR, event.ready(h.current()), h).state;
      s = apply(s, event.status('playing'), h).state;
      const r = apply(s, event.status(status), h);
      expect(r.history).toEqual([{ op: 'replace', hash: '' }]);
      expect(r.exited).toBe(0); // the runner already ended/exited
    }
  });

  it('an external file switch clears a stale anchor; a cross-file goto keeps it', () => {
    const stale = fakeHistory(presentHash(ID));
    const switched = apply(INITIAL_ANCHOR, event.file('other.pcd', stale.current()), stale);
    expect(switched.history).toEqual([{ op: 'replace', hash: '' }]);

    const h = fakeHistory(presentHash(ID));
    let s = apply(INITIAL_ANCHOR, event.ready(h.current()), h).state;
    s = apply(s, event.status('playing'), h).state;
    const goTo = apply(s, event.file('child.pcd', h.current()), h);
    expect(goTo.history).toEqual([]);
    expect(goTo.started).toEqual([]);
  });

  it('hash changes for an unknown flow while presenting exit and clear', () => {
    const h = fakeHistory(presentHash(ID));
    let s = apply(INITIAL_ANCHOR, event.ready(h.current()), h).state;
    s = apply(s, event.status('playing'), h).state;
    h.navigate(presentHash('gone'));
    const r = apply(s, event.hash(h.current()), h);
    expect(r.started).toEqual([]);
    expect(r.exited).toBe(1);
    expect(r.history).toEqual([{ op: 'replace', hash: '' }]);
  });

  it('ignores a hash event until the workspace is ready', () => {
    const h = fakeHistory();
    const r = apply(INITIAL_ANCHOR, event.hash(presentHash(ID)), h);
    expect(r.started).toEqual([]);
    expect(r.history).toEqual([]);
  });
});
