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
