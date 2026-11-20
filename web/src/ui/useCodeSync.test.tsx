// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// useCodeSync hook tests (M4-WP2/3 wiring): apply persists the FULL canonical
// buffer text to the active file (FR-K5 — the canvas projection drops
// code-only sections like flows, so the file must be written from the
// buffer, not from the canvas state), and the canvas receives the projection.
// The controller double mirrors the real wiring (useWorkspace.onCtrlState):
// loadState → onState → manager.saveCanvas + snapshot re-render, so the
// synchronous projection overwrite is actually exercised (M4 regression).
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { WorkspaceManager } from '../workspace/workspace';
import { MemoryStorage } from '../workspace/store/memory';
import { useCodeSync } from './useCodeSync';
import type { CanvasController, Snapshot } from './CanvasController';

const PDL_WITH_FLOW =
  'pcd 1.0\n\nsystem a "A" {\n}\n\nflow "F" as f {\n  intro "starts"\n  a -> a : "loop"\n}\n';

const FLOW_TEXT = 'intro "starts"';

interface Wired {
  ctrl: { current: CanvasController | null };
  loaded: Snapshot[];
  /** Latest emission (feeds the hook's `snap` prop via rerender). */
  snap: Snapshot | null;
  /** Emission path (useWorkspace.onCtrlState analogue). */
  emit: (s: Snapshot) => void;
  /** Emulates a canvas structural edit (palette drop / connect). */
  addTestObject: (o: Snapshot['objects'][number]) => void;
}

/** Full snapshot for emissions (objects/links are what the bridge reads). */
function emitSnap(
  objects: Snapshot['objects'],
  links: Snapshot['links'],
): Snapshot {
  return { objects, links, selection: { objects: [], links: [] }, viewport: { x: 0, y: 0, k: 1 } };
}

/**
 * Controller double mirroring the app wiring: loadState re-emits through
 * onState, and onState does exactly what useWorkspace.onCtrlState does —
 * capture the snapshot (→ rerender) and save the canvas projection to the
 * active file.
 */
function wiredCtrl(manager: WorkspaceManager): Wired {
  const w: Wired = {
    ctrl: { current: null },
    loaded: [],
    snap: null,
    addTestObject: (o) => {
      if (w.snap === null) return;
      w.emit(emitSnap([...w.snap.objects, o], w.snap.links));
    },
    emit: (s: Snapshot) => {
      w.snap = s;
      const path = manager.activePath;
      if (path !== null) manager.saveCanvas(path, { objects: s.objects, links: s.links });
    },
  };
  w.ctrl.current = {
    loadState(s: Snapshot) {
      w.loaded.push(s);
      w.emit(s);
    },
    // F-28: the bridge only trusts a hydrated canvas and reads its live state
    isHydrated: () => true,
    get snapshot() {
      return w.snap ?? emitSnap([], []);
    },
  } as unknown as CanvasController;
  return w;
}

async function makeManager(): Promise<WorkspaceManager> {
  const manager = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
  manager.createFileAt('a.pcd', '');
  manager.openFile('a.pcd');
  return manager;
}

/** Mount the hook against `manager` + the wired ctrl; `snap` feeds rerenders. */
function mountSync(
  manager: WorkspaceManager,
  w: Wired,
  opts: { activePath: string | null } = { activePath: 'a.pcd' },
) {
  return renderHook(
    (props: { snap: Snapshot | null } | undefined) =>
      useCodeSync({
        manager,
        ready: true,
        activePath: opts.activePath,
        version: 1,
        ctrlRef: w.ctrl,
        snap: props?.snap ?? null,
      }),
    { initialProps: { snap: null as Snapshot | null } },
  );
}

/** Idle-parse wait (machine uses real 300 ms timers). */
const idle = (): Promise<void> => new Promise((r) => setTimeout(r, 400));

describe('useCodeSync apply port', () => {
  it('idle apply writes the full buffer text to the file (flows survive)', async () => {
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result } = mountSync(manager, w);
    // type a doc with a flow (canvas cannot model flows)
    act(() => {
      result.current.machine.textChanged(PDL_WITH_FLOW);
    });
    // real 300 ms idle parse → pending-apply → apply port
    await act(idle);
    // file holds the FULL text (a canvas-projection write would drop the flow)
    expect(manager.text('a.pcd')).toContain(FLOW_TEXT);
    // canvas got the projection (objects + links only)
    expect(w.loaded).toHaveLength(1);
    expect(w.loaded[0]?.objects).toHaveLength(1);
    // machine: apply happened; without the bridge echo it stays pending-apply
    expect(result.current.machine.snapshot().state).toBe('pending-apply');
  });

  it('an empty file whose canvas projection is the magic line does not diverge', async () => {
    // The welcome file is empty; the canvas loads it and emits the projection of an
    // empty document (`pcd 1.0`). Those are the same document, so closing the tab
    // must not raise the unsaved-changes prompt for a file nobody edited.
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result, rerender } = mountSync(manager, w);
    act(() => {
      w.ctrl.current?.loadState(emitSnap([], []));
    });
    rerender({ snap: w.snap });
    expect(result.current.machine.snapshot().divergedFromSaved).toBe(false);
  });

  it('apply → canvas echo converges clean; the file keeps the full text', async () => {
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result, rerender } = mountSync(manager, w);
    act(() => {
      result.current.machine.textChanged(PDL_WITH_FLOW);
    });
    await act(idle); // idle parse → apply
    expect(w.loaded).toHaveLength(1); // canvas loaded (projection)
    // feed the emission through the bridge (echo → applied + markSaved)
    rerender({ snap: w.snap });
    const snap = result.current.machine.snapshot();
    expect(snap.state).toBe('clean');
    // the file must still hold the FULL text — loadState synchronously wrote
    // the projection first; the apply port's saveText has to win (D-M4-6)
    expect(manager.text('a.pcd')).toContain(FLOW_TEXT);
    expect(snap.divergedFromSaved).toBe(false);
  });

  it('position-only apply (auto-layout) converges despite an unchanged projection (M6 FR-V3)', async () => {
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result, rerender } = mountSync(manager, w);
    act(() => {
      result.current.machine.textChanged(PDL_WITH_FLOW);
    });
    await act(idle);
    rerender({ snap: w.snap }); // echo → clean
    expect(result.current.machine.snapshot().state).toBe('clean');
    // apply-layout writes positions into top-level layout state: the doc's
    // objects/links are unchanged, so the canvas emission serializes IDENTICALLY
    // to the last one. The echo check must win over the emission dedupe.
    const withPositions = PDL_WITH_FLOW + '\nposition a (10, 20)\n';
    act(() => {
      result.current.machine.textChanged(withPositions);
    });
    await act(idle); // idle parse → pending-apply → apply port
    rerender({ snap: w.snap }); // unchanged-projection emission
    const snap = result.current.machine.snapshot();
    expect(snap.state).toBe('clean');
    expect(snap.divergedFromSaved).toBe(false);
    // the file keeps the FULL buffer text (layout survives D-M4-6)
    expect(manager.text('a.pcd')).toContain('position a (10, 20)');
    expect(manager.text('a.pcd')).toContain('position a (10, 20)');
  });

  it('genuine canvas edit after an apply re-renders the buffer (parsable)', async () => {
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result, rerender } = mountSync(manager, w);
    // mermaid-like text: links have no ids (the apply synthesizes them)
    act(() => {
      result.current.machine.textChanged('pcd 1.0\n\nsystem api "API" {\n}\n\napi -> api : "loop"\n');
    });
    await act(idle); // idle parse → apply → echo
    rerender({ snap: w.snap });
    expect(result.current.machine.snapshot().state).toBe('clean');
    // palette drop: a new object appears on the canvas (System 1 in the e2e)
    w.addTestObject({ id: 'o1', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'System 1' });
    rerender({ snap: w.snap });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250)); // 150 ms code re-render
    });
    const snap = result.current.machine.snapshot();
    expect(snap.codeText).toContain('System 1'); // buffer updated (M4 fix)
    expect(snap.codeText).toContain('system api'); // existing objects kept
    // the synthesized link id (`api-api-0`) must keep the buffer parsable
    act(() => {
      result.current.machine.formatNow();
    });
    expect(result.current.machine.snapshot().state).toBe('clean');
    // structural-only doc: file (projection) and buffer converge
    expect(result.current.machine.snapshot().divergedFromSaved).toBe(false);
  });

  it('formatNow persists the formatted buffer and applies to the canvas', async () => {
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result } = mountSync(manager, w);
    act(() => {
      // messy but valid: extra blank lines are canonicalized by print
      result.current.machine.textChanged('pcd 1.0\n\n\nsystem a "A" {\n}\n');
    });
    act(() => {
      result.current.machine.formatNow();
    });
    expect(result.current.machine.snapshot().state).toBe('clean');
    expect(manager.text('a.pcd')).toBe(result.current.machine.snapshot().codeText);
    expect(w.loaded).toHaveLength(1);
    // not diverged after the consumer confirms the save (FR-K4 idempotence)
    act(() => {
      result.current.machine.markSaved(manager.text('a.pcd'));
    });
    expect(result.current.machine.snapshot().divergedFromSaved).toBe(false);
  });

  it('apply without an active file touches no file but still drives the canvas', async () => {
    const manager = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
    const w = wiredCtrl(manager); // manager has no files → emission saves nothing
    const { result } = mountSync(manager, w, { activePath: null });
    act(() => {
      result.current.machine.textChanged('pcd 1.0\n\nsystem a "A" {\n}\n');
    });
    await act(idle);
    expect(w.loaded).toHaveLength(1);
    expect(manager.files()).toEqual([]);
  });
});

/**
 * Readiness: the machine is empty and "clean" until the open file's text is
 * loaded, so the pane needs a signal that separates "loaded and clean" from
 * "nothing loaded yet". Without it the editor is offered for typing while the
 * buffer is still empty, and the incoming file text overwrites the keystroke
 * (observed as a duplicated header and a permanent parse error).
 */
describe('useCodeSync readiness', () => {
  it('reports not loaded while the workspace is still starting', () => {
    const manager = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
    manager.createFileAt('a.pcd', 'pcd 1.0\n\nsystem a "A" {\n}\n');
    manager.openFile('a.pcd');
    const w = wiredCtrl(manager);
    const { result } = renderHook(() =>
      useCodeSync({
        manager,
        ready: false, // workspace not initialized yet
        activePath: 'a.pcd',
        version: 1,
        ctrlRef: w.ctrl,
        snap: null,
      }),
    );
    expect(result.current.loaded).toBe(false);
    expect(result.current.machine.snapshot().codeText).toBe('');
    expect(result.current.machine.snapshot().state).toBe('clean'); // the false signal
  });

  it('reports loaded once the file text is in the machine', () => {
    const manager = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
    manager.createFileAt('a.pcd', 'pcd 1.0\n\nsystem a "A" {\n}\n');
    manager.openFile('a.pcd');
    const w = wiredCtrl(manager);
    const { result } = mountSync(manager, w);
    expect(result.current.loaded).toBe(true);
    expect(result.current.machine.snapshot().codeText).toContain('system a "A"');
  });
  it('reports loaded for a workspace with no open file (nothing to wait for)', () => {
    const manager = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
    const w = wiredCtrl(manager);
    const { result } = mountSync(manager, w, { activePath: null });
    expect(result.current.loaded).toBe(true);
    expect(result.current.machine.snapshot().codeText).toBe('');
  });
});

/**
 * A canvas emission must never leave the buffer unparsable. The canvas loads the
 * open file on startup; on a slow machine that load emission can land *after*
 * the user has already typed a different document. The merge replaces the
 * document's entities with the canvas's (they come from the file the canvas
 * loaded) while keeping the buffer's flows, so flow steps end up pointing at
 * entities that no longer exist — a permanent parse error in the code view.
 * The buffer the user can see is the source of truth once it parses: the bridge
 * refuses the merge instead of corrupting it.
 */
describe('useCodeSync merge safety', () => {
  const TYPED = `pcd 1.0

person user "Shopper"
system shop "Webshop"

user -> shop as L1

flow "Checkout" as checkout {
  intro "Start"
  user -> shop : "browse"
  conclusion "Done"
}
`;

  const STARTUP_FILE = 'pcd 1.0\n\nsystem a "A" {\n}\nsystem b "B" {\n}\n\na -> b as La\n';

  it('a late load emission does not corrupt a document the user typed', async () => {
    // The file the canvas loads at startup is NOT the document the user types.
    const manager = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
    manager.createFileAt('a.pcd', STARTUP_FILE);
    manager.openFile('a.pcd');
    const w = wiredCtrl(manager);
    const { result, rerender } = mountSync(manager, w);
    act(() => {
      result.current.machine.textChanged(TYPED);
    });
    // The canvas finishes loading a *different* document (the startup file) and
    // emits its state after the typing: it becomes the queued canvas change.
    w.emit(
      emitSnap(
        [
          { id: 'a', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' },
          { id: 'b', kind: 'system', x: 300, y: 0, w: 160, h: 60, name: 'B' },
        ],
        [{ id: 'La', from: 'a', to: 'b' }],
      ),
    );
    rerender({ snap: w.snap });
    await act(idle); // idle parse → pending-apply → apply
    rerender({ snap: w.snap }); // echo → applied() → reachClean flushes the queue
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250)); // 150 ms code re-render
    });
    const snap = result.current.machine.snapshot();
    // The typed document survives: its entities, its flow, and a parsable buffer.
    expect(snap.codeText).toContain('person user "Shopper"');
    expect(snap.codeText).toContain('system shop "Webshop"');
    expect(snap.state).not.toBe('error');
  });

  it('a canvas edit still wins while the buffer parses', async () => {
    const manager = await makeManager();
    const w = wiredCtrl(manager);
    const { result, rerender } = mountSync(manager, w);
    act(() => {
      result.current.machine.textChanged('pcd 1.0\n\nsystem api "API" {\n}\n');
    });
    await act(idle); // apply → canvas loaded
    rerender({ snap: w.snap }); // echo → clean
    w.addTestObject({ id: 'o9', kind: 'system', x: 0, y: 200, w: 160, h: 60, name: 'Worker' });
    rerender({ snap: w.snap });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(result.current.machine.snapshot().codeText).toContain('Worker');
  });
});
