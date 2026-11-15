// SPDX-License-Identifier: GPL-3.0-only
// Sync state machine tests (M4-WP2, test-first) — FR-K2/K3/K5.
// Exhaustive transition table over states clean/editing/error/pending-apply:
//
//   clean    -textChanged(new)→  editing      (idle parse scheduled)
//   clean    -textChanged(echo)→ clean        (echo suppressed, no timer)
//   clean    -canvasChanged→    clean         (code re-render debounced 150 ms)
//   editing  -textChanged→      editing       (idle rescheduled)
//   editing  -idle parse OK→    pending-apply (apply requested; applied() → clean)
//   editing  -idle parse FAIL→  error         (buffer never clobbered)
//   error    -textChanged→      editing
//   error    -idle parse OK→    pending-apply
//   pending-apply -textChanged→ editing
//   *        -canvasChanged(non-clean)→ queued, flushed on clean (last wins)
//   *        -formatNow OK→     clean (+ apply + markSaved)
//   *        -formatNow FAIL→   error
//   *        -loadFile→         clean (timers cancelled, no stray apply)
//
// Property: any sequence of valid texts converges to clean with
// parse(print(doc)) equal to the applied doc (FR-K2 "valid text converges").
import { describe, expect, it, vi } from 'vitest';
import { createSyncMachine, type SyncMachine, type SyncSnapshot } from './sync';
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Doc } from '../../engine/model/types';

/** Deterministic scheduler: timers fire only when tick()en. */
class FakeScheduler {
  readonly pending = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  readonly scheduled: { ms: number }[] = [];
  schedule(fn: () => void, ms: number): number {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    this.scheduled.push({ ms });
    return id;
  }
  cancel(id: number): void {
    this.pending.delete(id);
  }
  /** Fire every pending timer (in schedule order, cascading). */
  flush(): void {
    while (this.pending.size > 0) {
      for (const { fn } of [...this.pending.values()]) fn();
    }
  }
  tickAll(ms: number): void {
    for (const [id, t] of [...this.pending]) {
      if (t.ms <= ms) {
        this.pending.delete(id);
        t.fn();
      }
    }
  }
}

const PDL_A = 'pcd 1.0\n\nsystem a "A"\n';
const PDL_B = 'pcd 1.0\n\nsystem b "B"\n';
const BAD = 'pcd 1.0\nsystem';

interface Rig {
  sched: FakeScheduler;
  machine: SyncMachine;
  appliedDocs: Doc[];
  snapshots: SyncSnapshot[];
}

const rig = (initial = PDL_A): Rig => {
  const sched = new FakeScheduler();
  const appliedDocs: Doc[] = [];
  const snapshots: SyncSnapshot[] = [];
  const machine = createSyncMachine({
    schedule: (fn, ms) => sched.schedule(fn, ms),
    cancel: (id) => sched.cancel(id as number),
    apply: (doc) => appliedDocs.push(doc),
    codeDebounceMs: 150,
    idleMs: 300,
  });
  machine.subscribe((s) => snapshots.push(s));
  machine.loadFile(initial);
  return { sched, machine, appliedDocs, snapshots };
};

const state = (m: SyncMachine) => m.snapshot().state;

describe('initial state', () => {
  it('loadFile → clean, code shows the file text, not diverged', () => {
    const { machine } = rig();
    const snap = machine.snapshot();
    expect(snap.state).toBe('clean');
    expect(snap.codeText).toBe(PDL_A);
    expect(snap.diagnostics).toEqual([]);
    expect(snap.divergedFromSaved).toBe(false);
  });
});

describe('code → canvas (textChanged path)', () => {
  it('clean + new text → editing; idle OK → pending-apply → applied() → clean (canonicalized)', () => {
    const { sched, machine, appliedDocs } = rig();
    machine.textChanged(PDL_B);
    expect(state(machine)).toBe('editing');
    expect(machine.snapshot().codeText).toBe(PDL_B); // buffer preserved
    sched.tickAll(300);
    expect(state(machine)).toBe('pending-apply');
    expect(appliedDocs).toHaveLength(1);
    machine.applied();
    expect(state(machine)).toBe('clean');
    // buffer converges to the canonical print of the applied doc (FR-K4)
    expect(machine.snapshot().codeText).toBe(printDoc(parsePDL(PDL_B).doc!));
    // the file on disk still holds the old content until autosave runs
    expect(machine.snapshot().divergedFromSaved).toBe(true);
    machine.markSaved(machine.snapshot().codeText);
    expect(machine.snapshot().divergedFromSaved).toBe(false);
  });

  it('clean + echoed text (already rendered) stays clean without scheduling', () => {
    const { sched, machine } = rig();
    machine.textChanged(PDL_A);
    expect(state(machine)).toBe('clean');
    expect(sched.pending.size).toBe(0);
  });

  it('editing + more text reschedules the idle timer (old timer cancelled)', () => {
    const { sched, machine, appliedDocs } = rig();
    machine.textChanged(PDL_B);
    const count = sched.pending.size;
    machine.textChanged('pcd 1.0\nsystem c "C"\n');
    expect(sched.pending.size).toBe(count); // replaced, not accumulated
    sched.tickAll(300);
    expect(appliedDocs).toHaveLength(1);
    expect(appliedDocs[0]!.objects[0]!.id).toBe('c');
  });

  it('parse failure → error; buffer preserved verbatim; diagnostics populated', () => {
    const { sched, machine } = rig();
    machine.textChanged(BAD);
    sched.tickAll(300);
    const snap = machine.snapshot();
    expect(snap.state).toBe('error');
    expect(snap.codeText).toBe(BAD); // never clobbered (FR-K3)
    expect(snap.diagnostics.length).toBeGreaterThan(0);
    expect(machine.snapshot().divergedFromSaved).toBe(true);
  });

  it('error + new text → editing again (recoverable)', () => {
    const { sched, machine } = rig();
    machine.textChanged(BAD);
    sched.tickAll(300);
    expect(state(machine)).toBe('error');
    machine.textChanged(PDL_B);
    expect(state(machine)).toBe('editing');
    sched.tickAll(300);
    expect(state(machine)).toBe('pending-apply');
    machine.applied();
    expect(state(machine)).toBe('clean');
  });
});

describe('canvas → code (canvasChanged path)', () => {
  it('clean + canvasChanged → code re-rendered after the 150 ms debounce', () => {
    const { sched, machine } = rig();
    const doc = parsePDL(PDL_B).doc!;
    machine.canvasChanged(doc);
    expect(machine.snapshot().codeText).toBe(PDL_A); // not yet
    sched.tickAll(150);
    expect(machine.snapshot().codeText).toBe(printDoc(doc));
    expect(state(machine)).toBe('clean');
  });

  it('canvasChanged whose canonical print equals the buffer is suppressed', () => {
    const { sched, machine } = rig();
    machine.canvasChanged(parsePDL(PDL_A).doc!);
    expect(sched.pending.size).toBe(0);
    expect(machine.snapshot().codeText).toBe(PDL_A);
  });

  it('a no-op canvas change does not cancel a newer pending render (F-28)', () => {
    const { sched, machine } = rig();
    // 1. a real change schedules a render
    const change = parsePDL('pcd 1.0\n\nsystem c "C"\n').doc!;
    machine.canvasChanged(change);
    // 2. a stale request whose render equals the current buffer arrives —
    //    it must NOT discard the pending render (the old code cancelled it,
    //    leaving the code view stuck on stale text).
    machine.canvasChanged(parsePDL(PDL_A).doc!);
    sched.tickAll(150);
    expect(machine.snapshot().codeText).toBe(printDoc(change));
  });

  it('rapid canvas changes collapse to the last render', () => {
    const { sched, machine } = rig();
    machine.canvasChanged(parsePDL(PDL_B).doc!);
    machine.canvasChanged(parsePDL('pcd 1.0\nsystem c "C"\n').doc!);
    sched.tickAll(150);
    expect(machine.snapshot().codeText).toContain('"C"');
  });

  it('typing before the render debounce fires cancels it (buffer never clobbered)', () => {
    const { sched, machine, appliedDocs } = rig();
    machine.canvasChanged(parsePDL(PDL_B).doc!); // schedules a 150 ms code re-render
    machine.textChanged('pcd 1.0\n\nsystem typed "Typed" {\n}\n'); // before it fires
    sched.tickAll(1000);
    // the idle parse applies the TYPED text, not the queued canvas render
    expect(machine.snapshot().codeText).toBe('pcd 1.0\n\nsystem typed "Typed" {\n}\n');
    expect(appliedDocs).toHaveLength(1);
    expect(printDoc(appliedDocs[0]!)).toBe(
      printDoc(parsePDL('pcd 1.0\n\nsystem typed "Typed" {\n}\n').doc!),
    );
  });
});

describe('cross traffic: canvas edits while the buffer diverges', () => {
  it('editing + canvasChanged → queued; flushed as a code re-render after clean', () => {
    const { sched, machine, appliedDocs } = rig();
    machine.textChanged(PDL_B); // editing
    const canvasDoc = parsePDL('pcd 1.0\nsystem z "Z"\n').doc!;
    machine.canvasChanged(canvasDoc); // must not clobber the buffer
    expect(machine.snapshot().codeText).toBe(PDL_B);
    sched.tickAll(300); // buffer parse OK → pending-apply → applied
    machine.applied(); // clean; queued canvas change flushes (re-applied + rendered)
    expect(state(machine)).toBe('clean');
    sched.tickAll(150); // debounced render of the queued canvas doc
    expect(machine.snapshot().codeText).toBe(printDoc(canvasDoc));
    expect(appliedDocs.at(-1)!.objects[0]!.id).toBe('z'); // canvas converged too
  });

  it('pending-apply + canvasChanged → same queue discipline', () => {
    const { sched, machine } = rig();
    machine.textChanged(PDL_B);
    sched.tickAll(300); // pending-apply
    const canvasDoc = parsePDL('pcd 1.0\nsystem q "Q"\n').doc!;
    machine.canvasChanged(canvasDoc);
    machine.applied(); // clean + flush
    expect(state(machine)).toBe('clean');
    sched.tickAll(150);
    expect(machine.snapshot().codeText).toBe(printDoc(canvasDoc));
  });

  it('error + canvasChanged → queued, stays error until text converges', () => {
    const { sched, machine } = rig();
    machine.textChanged(BAD);
    sched.tickAll(300); // error
    machine.canvasChanged(parsePDL(PDL_B).doc!);
    expect(state(machine)).toBe('error');
    expect(machine.snapshot().codeText).toBe(BAD);
    machine.textChanged(PDL_A); // recover
    sched.tickAll(300);
    machine.applied();
    sched.tickAll(150); // queued render fires after clean
    // last canvas-relevant event wins: the queued canvas doc (B) is
    // re-applied and rendered after the buffer (A) converged
    expect(machine.snapshot().codeText).toBe(printDoc(parsePDL(PDL_B).doc!));
  });
});

describe('formatNow (format-on-save hook, FR-K4)', () => {
  it('editing + formatNow (parses) → clean, canonical text, apply, markSaved', () => {
    const { sched, machine, appliedDocs } = rig();
    machine.textChanged('pcd 1.0\nsystem   b    "B"\n'); // non-canonical
    expect(state(machine)).toBe('editing');
    machine.formatNow();
    expect(state(machine)).toBe('clean');
    expect(machine.snapshot().codeText).toBe(printDoc(parsePDL(PDL_B).doc!));
    expect(appliedDocs).toHaveLength(1);
    expect(machine.snapshot().divergedFromSaved).toBe(true); // saved later (WP4)
    machine.markSaved(machine.snapshot().codeText);
    expect(machine.snapshot().divergedFromSaved).toBe(false);
    expect(sched.pending.size).toBe(0); // idle timer cancelled
  });

  it('formatNow on garbage → error, buffer preserved', () => {
    const { machine } = rig();
    machine.textChanged(BAD);
    machine.formatNow();
    expect(state(machine)).toBe('error');
    expect(machine.snapshot().codeText).toBe(BAD);
  });

  it('formatNow in clean with canonical text is a no-op (idempotent, FR-K4)', () => {
    const { machine, appliedDocs } = rig();
    machine.formatNow();
    expect(state(machine)).toBe('clean');
    expect(appliedDocs).toHaveLength(0);
    expect(machine.snapshot().codeText).toBe(PDL_A);
  });
});

describe('loadFile resets cleanly', () => {
  it('loadFile during editing cancels timers and never applies the old buffer', () => {
    const { sched, machine, appliedDocs } = rig();
    machine.textChanged(PDL_B); // editing, idle armed
    machine.loadFile(PDL_A);
    expect(state(machine)).toBe('clean');
    sched.flush();
    expect(appliedDocs).toHaveLength(0); // stray timer must not fire
    expect(machine.snapshot().codeText).toBe(PDL_A);
  });
});

describe('markSaved / divergedFromSaved (FR-K5 close prompt)', () => {
  it('buffer edits diverge from saved; markSaved converges the flag', () => {
    const { machine } = rig();
    machine.textChanged(PDL_B);
    expect(machine.snapshot().divergedFromSaved).toBe(true);
    machine.markSaved(machine.snapshot().codeText);
    expect(machine.snapshot().divergedFromSaved).toBe(false);
    // still editing: saved flag converged but sync state unchanged
    expect(state(machine)).toBe('editing');
  });
});

describe('subscribe', () => {
  it('emits a snapshot per transition', () => {
    const { machine, snapshots } = rig();
    machine.textChanged(PDL_B);
    machine.textChanged(PDL_B); // same text again: still editing (reschedule)
    expect(snapshots.at(-1)!.state).toBe('editing');
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
  });
});

describe('property: valid text always converges (FR-K2)', () => {
  it('random valid docs applied through the machine end clean and consistent', () => {
    const { sched, machine } = rig();
    const kinds = ['person', 'system', 'container', 'datastore'];
    let seed = 42;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 50; i++) {
      const k = kinds[rand(kinds.length)];
      const text = `pcd 1.0\n${k} obj${i} "Object ${i}"\n`;
      machine.textChanged(text);
      sched.tickAll(300);
      if (state(machine) === 'pending-apply') machine.applied();
      expect(state(machine), `iteration ${i}`).toBe('clean');
      const snap = machine.snapshot();
      expect(snap.codeText.startsWith('pcd 1.0')).toBe(true);
      expect(parsePDL(snap.codeText).doc!.objects[0]!.id).toBe(`obj${i}`);
    }
  });
});

describe('real timers integration (vi.useFakeTimers light check)', () => {
  it('machine also works with setTimeout-based scheduling', async () => {
    vi.useFakeTimers();
    const appliedDocs: Doc[] = [];
    const machine = createSyncMachine({
      schedule: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
      apply: (doc) => appliedDocs.push(doc),
    });
    machine.loadFile(PDL_A);
    machine.textChanged(PDL_B);
    await vi.advanceTimersByTimeAsync(350);
    expect(state(machine)).toBe('pending-apply');
    machine.applied();
    expect(state(machine)).toBe('clean');
    vi.useRealTimers();
  });
});

describe('undo interleaved with a queued canvas render (BUG-08 probe)', () => {
  const LINKED = 'pcd 1.0\n\nsystem a "A"\nsystem b "B"\n\na -requests-> b as L1\n';
  const DASHED = 'pcd 1.0\n\nsystem a "A"\nsystem b "B"\n\na -requests-> b as L1 {\n  line dashed\n}\n';

  it('a render queued before undo cannot resurrect the undone text', () => {
    const { sched, machine } = rig(LINKED);
    const dashed = parsePDL(DASHED).doc;
    const solid = parsePDL(LINKED).doc;
    expect(dashed).not.toBeNull();
    expect(solid).not.toBeNull();

    machine.canvasChanged(dashed!); // style edit queued for the code view
    expect(machine.snapshot().state).toBe('clean');
    machine.canvasChanged(solid!); // undo reverts it before the debounce fires
    sched.flush();

    expect(machine.snapshot().codeText).toBe(printDoc(solid!));
  });
});
