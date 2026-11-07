// SPDX-License-Identifier: GPL-3.0-only
// M3: WorkspaceManager suite (replaces the M0 scaffold placeholder).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { WorkspaceManager, pcdToState, stateToPcd, type CanvasState } from './workspace';
import { MemoryStorage } from './store/memory';
import { IdbStorage } from './store/idb';
import { newStoredWorkspace, type StoragePort } from './store/port';
import { getNode, readFile, deleteNode } from './fs';
import { parsePDL } from '../engine/format/parser';

const state = (overrides: Partial<CanvasState> = {}): CanvasState => ({
  objects: [
    { id: 'api', kind: 'system', x: 100, y: 100, w: 160, h: 60, name: 'API' },
    { id: 'db', kind: 'datastore', x: 300, y: 100, w: 140, h: 64, name: 'DB' },
  ],
  links: [{ id: 'L1', from: 'api', to: 'db', type: 'uses', label: 'reads' }],
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('init (FR-S1 restore)', () => {
  it('bootstraps a welcome file when storage is empty', async () => {
    const ws = new WorkspaceManager();
    await ws.init();
    expect(ws.files().map((f) => f.path)).toEqual(['untitled.pcd']);
    expect(ws.activePath).toBe('untitled.pcd');
  });

  it('restores tree + tabs from a stored record', async () => {
    const seed = new WorkspaceManager({ skipWelcome: true });
    seed.createFileAt('svc/main.pcd', 'pcd 1.0\nsystem a "A" {\n}');
    const port = new MemoryStorage();
    await port.save(seed.record());
    const restored = new WorkspaceManager({ storage: port, skipWelcome: true });
    await restored.init();
    expect(restored.files().map((f) => f.path)).toEqual(['svc/main.pcd']);
    expect(restored.tabs.tabs.map((t) => t.path)).toEqual(['svc/main.pcd']);
    expect(restored.activePath).toBe('svc/main.pcd');
  });

  it('drops stale tab entries pointing at deleted files', async () => {
    const seed = new WorkspaceManager({ skipWelcome: true });
    seed.createFileAt('a.pcd', '');
    seed.createFileAt('ghost.pcd', '');
    const rec = seed.record();
    deleteNode(rec.tree, 'ghost.pcd'); // simulate a file lost outside the tab list
    const port = new MemoryStorage();
    await port.save(rec);
    const restored = new WorkspaceManager({ storage: port, skipWelcome: true });
    await restored.init();
    expect(restored.tabs.tabs.map((t) => t.path)).toEqual(['a.pcd']);
  });

  it('restoreRecord adopts a snapshot record: tree, tabs, name (M6 FR-W7)', () => {
    const seed = new WorkspaceManager({ skipWelcome: true });
    seed.createFileAt('svc/main.pcd', 'pcd 1.0\nsystem a "A" {\n}');
    const rec = seed.record();
    rec.name = 'pre-refactor';
    // current workspace is different
    const live = new WorkspaceManager({ skipWelcome: true });
    live.createFileAt('other.pcd', 'pcd 1.0');
    live.restoreRecord(rec);
    expect(live.files().map((f) => f.path)).toEqual(['svc/main.pcd']);
    expect(live.name).toBe('pre-refactor');
    expect(live.activePath).toBe('svc/main.pcd');
    // stored record pristine — a second restore yields the same tree
    live.createFileAt('drift.pcd', '');
    live.restoreRecord(rec);
    expect(live.files().map((f) => f.path)).toEqual(['svc/main.pcd']);
  });

  it('starts fresh on a corrupt record and reports the reason', async () => {
    const port = new MemoryStorage();
    await port.save({ ...newStoredWorkspace(), tree: 'junk' } as unknown as Parameters<StoragePort['save']>[0]);
    const ws = new WorkspaceManager({ storage: port, skipWelcome: true });
    await ws.init();
    expect(ws.openError).toContain('corrupt');
    expect(ws.files()).toEqual([]);
  });
});

describe('tabs + file ops', () => {
  it('create/rename/move/duplicate/remove keep tabs consistent', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    ws.createFileAt('b.pcd', '');
    expect(ws.activePath).toBe('b.pcd');

    ws.renamePath('b.pcd', 'c.pcd');
    expect(ws.tabs.tabs.map((t) => t.path)).toEqual(['a.pcd', 'c.pcd']);
    expect(ws.activePath).toBe('c.pcd');

    ws.createFileAt('d/e.pcd', '');
    ws.movePath('d/e.pcd', '');
    expect(getNode(ws.root, 'e.pcd')?.kind).toBe('file');

    ws.renamePath('c.pcd', 'f.pcd');
    ws.removePath('f.pcd');
    expect(ws.tabs.tabs.map((t) => t.path)).toEqual(['a.pcd', 'e.pcd']);

    const copy = ws.duplicatePath('a.pcd');
    expect(copy).toBe('a copy.pcd');
    expect(getNode(ws.root, 'a copy.pcd')).not.toBeNull();

    ws.removePath('d'); // folder removal closes descendant tabs
    expect(ws.tabs.tabs.every((t) => !t.path.startsWith('d/'))).toBe(true);
  });

  it('rename retargets tabs under moved folders', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('docs/x.pcd', '');
    ws.createFileAt('docs/guide/y.pcd', '');
    ws.openFile('docs/guide/y.pcd');
    ws.createFileAt('arch/keep.pcd', ''); // destination folder must exist (opens keep)
    ws.openFile('docs/guide/y.pcd');
    ws.movePath('docs', 'arch');
    expect(ws.tabs.tabs.map((t) => t.path)).toEqual(['arch/docs/x.pcd', 'arch/docs/guide/y.pcd', 'arch/keep.pcd']);
    expect(ws.activePath).toBe('arch/docs/guide/y.pcd'); // focus follows the moved path
  });
});

describe('canvas ⇄ file (M3 mapping)', () => {
  it('serializes canvas state to canonical parsable PDL', () => {
    const text = stateToPcd(state());
    const doc = parsePDL(text).doc;
    expect(doc?.objects.map((o) => [o.id, o.name])).toEqual([['api', 'API'], ['db', 'DB']]);
    expect(doc?.links[0]?.from).toBe('api');
  });

  it('parses PDL back to canvas state with deterministic grid positions', () => {
    const st = pcdToState(stateToPcd(state()));
    expect(st.objects.map((o) => o.id)).toEqual(['api', 'db']);
    expect(st.objects[0]?.x).toBe(40);
    expect(st.objects[1]?.x).toBe(230); // 40 + 190
    expect(st.links).toEqual([{ id: 'L1', from: 'api', to: 'db', type: 'uses', label: 'reads' }]);
  });

  it('stored view positions overlay the grid (M6 FR-V4 apply roundtrip)', () => {
    const text =
      stateToPcd(state()) +
      '\nview "Default" {\n  position api (500, 10)\n}\n';
    const st = pcdToState(text);
    expect(st.objects[0]?.id).toBe('api');
    expect(st.objects[0]?.x).toBe(500); // stored position wins
    expect(st.objects[0]?.y).toBe(10);
    expect(st.objects[1]?.x).toBe(230); // unstored object keeps its grid slot
    // a named view other than the active one does not leak
    const st2 = pcdToState(
      stateToPcd(state()) + '\nview "Other" {\n  position api (500, 10)\n}\n',
    );
    expect(st2.objects[0]?.x).toBe(40); // grid
  });

  it('saveCanvas writes text, flags dirty, and skips identical content', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    ws.saveCanvas('a.pcd', state());
    expect(ws.text('a.pcd')).toBe(stateToPcd(state()));
    expect(ws.tabs.tabs[0]?.dirty).toBe(true);
    ws.markClean('a.pcd');

    const writeSpy = vi.spyOn(ws, 'scheduleSave');
    ws.saveCanvas('a.pcd', state()); // identical → no write, no save scheduling
    expect(writeSpy).not.toHaveBeenCalled();
    expect(ws.tabs.tabs[0]?.dirty).toBe(false);
  });

  it('canvasState returns empty state for empty files', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('empty.pcd', '');
    expect(ws.canvasState('empty.pcd')).toEqual({ objects: [], links: [] });
  });

  it('dirty flag tracks real content changes', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    ws.markClean('a.pcd');
    ws.saveCanvas('a.pcd', state());
    expect(ws.tabs.tabs[0]?.dirty).toBe(true);
  });
});

describe('canvas writes merge into the document (F-01)', () => {
  const RICH = `pcd 1.0
title "Payments"
direction LR

system api "API" {
  tag public
}

datastore db "DB"

api -requests-> db : "reads" as L1 {
  waypoint (10, 20)
}

flow "Checkout" as f1 {
  intro "start"
}

view "Default" {
  layout saved
  position api (120, 240)
}

style api {
  fill #ff0000
}
`;

  it('a simulated drag/rename keeps flow, view, position, style and link semantics', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', RICH);
    const st = pcdToState(RICH);
    const drag = {
      objects: st.objects.map((o) => ({ ...o, x: o.x + 40, y: o.y + 10 })),
      links: st.links,
    };
    ws.saveCanvas('a.pcd', drag);
    const text = ws.text('a.pcd');
    expect(text).toContain('flow "Checkout" as f1');
    expect(text).toContain('view "Default"');
    expect(text).toContain('position api (120, 240)');
    expect(text).toContain('style api {');
    expect(text).toContain('waypoint (10, 20)');
    expect(text).toContain('api -requests-> db : "reads" as L1');
    // and the merged text still re-parses to the same model
    expect(parsePDL(text).doc?.flows).toHaveLength(1);
  });

  it('keeps a bidirectional arrow bidirectional', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n\nsystem a "A"\n\nsystem b "B"\n\na <-> b as L\n');
    const st = pcdToState(ws.text('a.pcd'));
    ws.saveCanvas('a.pcd', { objects: st.objects, links: st.links });
    expect(ws.text('a.pcd')).toContain('a <-> b');
    expect(ws.text('a.pcd')).not.toContain('uses');
  });

  it('keeps group and note objects (F-06)', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n\ngroup g1 "Tier"\n\nnote n1 "memo"\n\nsystem s1 "S"\n');
    const st = ws.canvasState('a.pcd');
    expect(st.objects.map((o) => o.id)).toEqual(['g1', 'n1', 's1']);
    ws.saveCanvas('a.pcd', st);
    expect(ws.text('a.pcd')).toContain('group g1 "Tier"');
    expect(ws.text('a.pcd')).toContain('note n1 "memo"');
  });

  it('round-trips an explicit size (F-13)', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n\nsystem api "API" {\n  size 200 96\n}\n');
    const st = ws.canvasState('a.pcd');
    expect(st.objects[0]).toMatchObject({ id: 'api', w: 200, h: 96, size: { w: 200, h: 96 } });
    ws.saveCanvas('a.pcd', st);
    expect(ws.text('a.pcd')).toContain('size 200 96');
  });

  it('does not invent a size for objects that never had one (F-13)', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n\nsystem api "API"\n');
    const st = ws.canvasState('a.pcd');
    expect(st.objects[0]?.size).toBeUndefined();
    ws.saveCanvas('a.pcd', st);
    expect(ws.text('a.pcd')).not.toContain('size');
  });

  it('round-trips custom properties and style overrides (F-11)', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n\nsystem api "API"\n');
    const st = ws.canvasState('a.pcd');
    const next = {
      objects: st.objects.map((o) => ({
        ...o,
        properties: [{ key: 'owner', value: 'core' }],
        style: { fill: '#112233', text: '#ffffff' },
      })),
      links: st.links,
    };
    ws.saveCanvas('a.pcd', next);
    const text = ws.text('a.pcd');
    expect(text).toContain('property owner "core"');
    expect(text).toContain('fill #112233');
    expect(text).toContain('text #ffffff');

    const back = ws.canvasState('a.pcd');
    expect(back.objects[0]?.properties).toEqual([{ key: 'owner', value: 'core' }]);
    expect(back.objects[0]?.style).toMatchObject({ fill: '#112233', text: '#ffffff' });
  });

  it('clearing an override removes it from the file (F-11)', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n\nsystem api "API" {\n  style {\n    fill #112233\n  }\n}\n');
    const st = ws.canvasState('a.pcd');
    ws.saveCanvas('a.pcd', {
      objects: st.objects.map((o) => ({ ...o, style: {} })),
      links: st.links,
    });
    expect(ws.text('a.pcd')).not.toContain('fill #112233');
  });

  it('falls back to the projection when the file does not parse', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\nsystem');
    ws.saveCanvas('a.pcd', state());
    expect(ws.text('a.pcd')).toBe(stateToPcd(state()));
  });
});

describe('content durability (F-29)', () => {
  it('saveText persists to storage immediately, without waiting for the debounce', async () => {
    const port = new MemoryStorage();
    const ws = new WorkspaceManager({ storage: port, skipWelcome: true });
    ws.createFileAt('a.pcd', 'pcd 1.0\n');
    await ws.flush(); // baseline
    ws.saveText('a.pcd', 'pcd 1.0\n\nsystem z "Z"\n');
    // no flush() call — the content write must already be in the store
    const rec = await port.load();
    expect(getNode(rec!.tree, 'a.pcd')?.content).toContain('system z');
  });

  it('saveCanvas persists to storage immediately', async () => {
    const port = new MemoryStorage();
    const ws = new WorkspaceManager({ storage: port, skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    await ws.flush();
    ws.saveCanvas('a.pcd', state());
    const rec = await port.load();
    expect(getNode(rec!.tree, 'a.pcd')?.content).toContain('system api');
  });
});

describe('autosave → storage (FR-S1)', () => {
  it('flush persists the latest record with tree + tabs', async () => {
    const port = new MemoryStorage();
    const ws = new WorkspaceManager({ storage: port, skipWelcome: true });
    ws.createFileAt('svc/x.pcd', '');
    ws.saveCanvas('svc/x.pcd', state());
    await ws.flush();
    const rec = await port.load();
    expect(rec?.openTabs).toEqual(['svc/x.pcd']);
    expect(getNode(rec!.tree, 'svc/x.pcd')?.content).toContain('system api');
  });
});

describe('ZIP import/export (FR-W5)', () => {
  it('exports and re-imports losslessly (S4 core path)', async () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.createFileAt('svc/api.pcd', '');
    ws.saveCanvas('svc/api.pcd', state());
    ws.createFileAt('notes/idea.pcd', 'pcd 1.0\nsystem z "Z" {\n}');

    const blob = await ws.exportZip();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const target = new WorkspaceManager({ skipWelcome: true });
    const name = await target.importZip(bytes);
    expect(target.snapshotTree()).toEqual(ws.snapshotTree());
    expect(name).toBe('workspace');
  });

  it('imported manifest name replaces the workspace name', async () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    ws.name = 'custom';
    ws.createFileAt('a.pcd', 'pcd 1.0\nsystem q "Q" {\n}');
    const blob = await ws.exportZip();
    const target = new WorkspaceManager({ skipWelcome: true });
    expect(await target.importZip(new Uint8Array(await blob.arrayBuffer()))).toBe('custom');
  });
});

describe('per-file import (FR-W3)', () => {
  it('converts mermaid files to .pcd and opens the last import', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    const paths = ws.importFiles([
      { name: 'flow.mmd', text: 'flowchart TD\n  a[A]\n  b[B]\n  a --> b\n' },
      { name: 'plain.pcd', text: 'pcd 1.0\nsystem p "P" {\n}' },
    ]);
    expect(paths).toEqual(['flow.pcd', 'plain.pcd']);
    expect(ws.activePath).toBe('plain.pcd');
    const doc = parsePDL(readFile(ws.root, 'flow.pcd')).doc;
    expect(doc?.objects.map((o) => [o.id, o.name])).toEqual([['a', 'A'], ['b', 'B']]);
    expect(doc?.links.map((l) => [l.from, l.to])).toEqual([['a', 'b']]);
  });
});

describe('ephemeral + quota (FR-S2/S3)', () => {
  it('setEphemeral(true) carries the workspace in memory only', async () => {
    const port = new MemoryStorage();
    const ws = new WorkspaceManager({ storage: port, skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    await ws.setEphemeral(true);
    expect(ws.ephemeral).toBe(true);
    await ws.flush();
    expect(await port.load()).toBeNull(); // no IDB writes in private mode
  });

  it('quota failure degrades to ephemeral and keeps the session alive', async () => {
    const port = new MemoryStorage();
    const quotaStorage: StoragePort = {
      load: () => port.load(),
      save: async () => {
        throw Object.assign(new Error('q'), { name: 'QuotaExceededError' });
      },
      clear: () => port.clear(),
      estimate: () => port.estimate(),
    };
    const ws = new WorkspaceManager({ storage: quotaStorage, skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    await ws.flush(); // save throws quota → degrade
    expect(ws.quotaDegraded).toBe(true);
    expect(ws.ephemeral).toBe(true);
    expect(ws.files().map((f) => f.path)).toEqual(['a.pcd']); // tree intact in-memory
  });

  it('clearAll wipes storage and resets (FR-S4)', async () => {
    const port = new MemoryStorage();
    const ws = new WorkspaceManager({ storage: port });
    await ws.init();
    await ws.clearAll();
    expect(await port.load()).toBeNull();
    expect(ws.files().map((f) => f.path)).toEqual(['untitled.pcd']); // fresh bootstrap
  });

  it('clearAll in ephemeral mode leaves no welcome file bootstrap gap', async () => {
    const ws = new WorkspaceManager({ storage: new MemoryStorage(), skipWelcome: true });
    ws.createFileAt('a.pcd', '');
    await ws.setEphemeral(true);
    await ws.clearAll();
    expect(ws.files()).toEqual([]);
  });
});

describe('IDB integration', () => {
  it('restores from fake-indexeddb storage', async () => {
    const first = new WorkspaceManager({ storage: IdbStorage.open(new IDBFactory()), skipWelcome: true });
    first.createFileAt('x.pcd', 'pcd 1.0\nsystem x "X" {\n}');
    await first.flush();

    const second = new WorkspaceManager({ storage: IdbStorage.open(new IDBFactory()), skipWelcome: true });
    await second.init();
    expect(second.files()).toEqual([]);
  });

  it('full round-trip through real IDB flow', async () => {
    const factory = new IDBFactory();
    const first = new WorkspaceManager({ storage: IdbStorage.open(factory), skipWelcome: true });
    first.createFileAt('r/real.pcd', 'pcd 1.0\nsystem r "R" {\n}');
    await first.flush();

    const second = new WorkspaceManager({ storage: IdbStorage.open(factory), skipWelcome: true });
    await second.init();
    expect(second.files().map((f) => f.path)).toEqual(['r/real.pcd']);
  });
});

describe('subscribe/emit', () => {
  it('notifies listeners on mutations', () => {
    const ws = new WorkspaceManager({ skipWelcome: true });
    const spy = vi.fn();
    ws.subscribe(spy);
    ws.createFileAt('a.pcd', '');
    expect(spy).toHaveBeenCalled();
    expect(() => ws.createFileAt('a.pcd', '')).toThrow(/exists/); // no emit on failure
  });
});
