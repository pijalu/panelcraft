// SPDX-License-Identifier: GPL-3.0-only
// App shell (M3): file tree | tabs | palette | canvas | properties + toolbar.
// The canvas owns its imperative controller (ADR-0001: Preact renders chrome
// around the SVG, never inside it); the WorkspaceManager owns the virtual FS,
// tabs and autosave; chrome re-renders via manager.subscribe(). Lifecycle and
// sync wiring live in useWorkspace.ts; panels below are presentational.
import { useEffect, useRef, useState } from 'preact/hooks';
import { PALETTE_ORDER, labelFor, CanvasController, type Snapshot } from './CanvasController';
import { PropertiesPanel } from './PropertiesPanel';
import { Palette } from './Palette';
import { FileTree } from './FileTree';
import { Tabs } from './Tabs';
import { CodePane } from './CodePane';
import { FlowPane } from './flows/FlowPane';
import { PlayBar } from './flows/PlayBar';
import { ViewBar } from './views/ViewBar';
import { DepsPanel } from './deps/DepsPanel';
import { AppHeader } from './AppHeader';
import { AppDialogs } from './AppDialogs';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useCodeSync } from './useCodeSync';
import { useDivergedClose } from './useDivergedClose';
import { useFlowStage } from './useFlowStage';
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import type { CodeSyncHandle } from './useCodeSync';
import type { WorkspaceManager } from '../workspace/workspace';

/** Single-selection for the properties panel (obj xor link). */
function selections(snap: Snapshot | null): { obj: ReturnType<typeof findObj>; link: ReturnType<typeof findLink> } {
  return { obj: findObj(snap), link: findLink(snap) };
}

function findObj(snap: Snapshot | null) {
  if (!snap || snap.selection.objects.length !== 1) return null;
  const id = snap.selection.objects[0];
  return snap.objects.find((o) => o.id === id) ?? null;
}

function findLink(snap: Snapshot | null) {
  if (!snap || snap.selection.links.length !== 1) return null;
  const id = snap.selection.links[0];
  return snap.links.find((l) => l.id === id) ?? null;
}

/** Sidebar: Files | Flows tabs — flow editor lives here to keep the row
 * layout unchanged at 1280×720 (no width cost). */
function SidePane(props: {
  tab: 'files' | 'flows';
  onTab: (t: 'files' | 'flows') => void;
  manager: WorkspaceManager;
  version: number;
  activePath: string | null;
  onText(text: string): void;
  onPlay(flowKey: string): void;
}) {
  return (
    <aside class="sidebar">
      <div class="sidebar-tabs">
        <button
          type="button"
          data-testid="side-tab-files"
          class={props.tab === 'files' ? 'active' : ''}
          onClick={() => props.onTab('files')}
        >
          Files
        </button>
        <button
          type="button"
          data-testid="side-tab-flows"
          class={props.tab === 'flows' ? 'active' : ''}
          onClick={() => props.onTab('flows')}
        >
          Flows
        </button>
      </div>
      {props.tab === 'files' ? (
        <FileTree manager={props.manager} version={props.version} onOpen={(p) => props.manager.openFile(p)} />
      ) : (
        <FlowPane
          textOf={(p) => props.manager.text(p)}
          activePath={props.activePath}
          version={props.version}
          onChangeText={props.onText}
          onPlay={props.onPlay}
        />
      )}
    </aside>
  );
}

/** Canvas + code split (extracted to keep App under the function-length gate). */
function CanvasSplit(props: {
  canvas: ReturnType<typeof useCanvasController>;
  code: CodeSyncHandle;
  player: FlowPlayerApi;
}) {
  return (
    <div class="canvas-split">
      <main class="canvas-wrap">
        <svg ref={props.canvas.svgRef} class="pc-canvas" data-testid="canvas" width="100%" height="100%" />
        <PlayBar player={props.player} />
      </main>
      <CodePane machine={props.code.machine} snapshot={props.code.snapshot} onFormat={props.code.formatNow} />
    </div>
  );
}

/** Tab strip + view bar row (extracted to keep App under the length gate). */
function CanvasTopRow(props: {
  manager: WorkspaceManager;
  diverged: ReturnType<typeof useDivergedClose>;
  activePath: string | null;
  viewName: string | undefined;
  onView(n: string | undefined): void;
  onText(t: string): void;
  ctrl: CanvasController | null;
  selection: string[];
}) {
  return (
    <>
      <Tabs
        tabs={props.manager.tabs.tabs}
        active={props.manager.tabs.active}
        onSelect={(i) => {
          const t = props.manager.tabs.tabs[i];
          if (t) props.manager.openFile(t.path);
        }}
        onClose={props.diverged.requestCloseTab}
        onReorder={(from, to) => props.manager.moveTabAt(from, to)}
      />
      <ViewBar
        text={props.activePath !== null ? props.manager.text(props.activePath) : null}
        viewName={props.viewName}
        onView={props.onView}
        onChangeText={props.onText}
        ctrl={props.ctrl}
        selection={props.selection}
      />
    </>
  );
}

export function App() {
  const ws = useWorkspace();
  const canvas = useCanvasController(ws.manager, ws.ready, ws.version);
  const activePath = ws.ready ? ws.manager.activePath : null;
  const { manager } = ws;
  const [clearOpen, setClearOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'files' | 'flows'>('files');
  const [viewName, setViewName] = useState<string | undefined>(undefined);
  const [snapsOpen, setSnapsOpen] = useState(false);
  // Views are per-file session state: switching files resets to the default view.
  useEffect(() => {
    setViewName(undefined);
  }, [activePath]);
  // Ref mirror for the code-sync apply port (loads the active view's stored
  // positions on apply — M6 FR-V4); refs survive the machine's long lifetime.
  const viewNameRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    viewNameRef.current = viewName;
  }, [viewName]);
  const code = useCodeSync({
    manager: ws.manager,
    ready: ws.ready,
    activePath,
    version: ws.version,
    ctrlRef: canvas.ctrlRef,
    snap: canvas.snap,
    viewRef: viewNameRef,
  });
  const player = useFlowStage({ manager, canvas, activePath });
  const ctrl = canvas.ctrlRef.current;
  const sel = selections(canvas.snap);
  const diverged = useDivergedClose({
    manager: ws.manager,
    activePath,
    machine: code.machine,
    snapshot: code.snapshot,
  });

  const clearData = (): void => {
    canvas.resync(); // forget the old active path — the workspace is wiped
    void manager.clearAll();
    setClearOpen(false);
  };

  return (
    <div class="app-shell" data-testid="app-shell">
      <AppHeader
        ws={ws}
        svgRef={canvas.svgRef}
        onFlash={setFlash}
        onClearRequest={() => setClearOpen(true)}
        onSnapshotsRequest={() => setSnapsOpen(true)}
      />
      <div class="app-body">
        <SidePane
          tab={sideTab}
          onTab={setSideTab}
          manager={manager}
          version={ws.version}
          activePath={activePath}
          onText={(text) => code.machine.textChanged(text)}
          onPlay={(flowKey) => {
            if (activePath !== null) player.start(activePath, flowKey);
          }}
        />
        <Palette
          kinds={PALETTE_ORDER}
          onPlace={(k) => ctrl?.addObject(k)}
          onDragDrop={canvas.onPaletteDrop}
        />
        <main class="canvas-col">
          <CanvasTopRow
            manager={manager}
            diverged={diverged}
            activePath={activePath}
            viewName={viewName}
            onView={setViewName}
            onText={(t) => code.machine.textChanged(t)}
            ctrl={canvas.ctrlRef.current}
            selection={canvas.snap?.selection.objects ?? []}
          />
          <CanvasSplit canvas={canvas} code={code} player={player} />
        </main>
        <div class="props-col">
          <PropertiesPanel
            obj={sel.obj}
            link={sel.link}
            nameFieldRef={canvas.nameFieldRef}
            onChangeObject={(id, patch) => ctrl?.updateObject(id, patch)}
            onChangeLink={(id, patch) => ctrl?.updateLink(id, patch)}
            onFit={() => ctrl?.fitSelection()}
          />
          <DepsPanel
            text={activePath !== null ? manager.text(activePath) : null}
            viewName={viewName}
            activeId={sel.obj?.id ?? null}
            ctrl={canvas.ctrlRef.current}
            onPick={(id) => canvas.ctrlRef.current?.reveal(id)}
          />
        </div>
      </div>
      <AppDialogs
        manager={manager}
        activePath={activePath}
        ctrlRef={canvas.ctrlRef}
        diverged={diverged}
        clearOpen={clearOpen}
        clearData={clearData}
        onClearCancel={() => setClearOpen(false)}
        flash={flash}
        onFlashDismiss={() => setFlash(null)}
        snapsOpen={snapsOpen}
        onSnapsClose={() => setSnapsOpen(false)}
      />
    </div>
  );
}

export { labelFor };
