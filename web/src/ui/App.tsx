// SPDX-License-Identifier: GPL-3.0-only
// App shell (M3): file tree | tabs | palette | canvas | properties + toolbar.
// The canvas owns its imperative controller (ADR-0001: Preact renders chrome
// around the SVG, never inside it); the WorkspaceManager owns the virtual FS,
// tabs and autosave; chrome re-renders via manager.subscribe(). Lifecycle and
// sync wiring live in useWorkspace.ts; panels below are presentational.
import { useEffect, useRef, useState } from 'preact/hooks';
import { labelFor, CanvasController, type Snapshot } from './CanvasController';
import { FileTree } from './FileTree';
import { Tabs } from './Tabs';
import { CodePane } from './CodePane';
import { FlowPane } from './flows/FlowPane';
import { PlayBar } from './flows/PlayBar';
import { ViewBar } from './views/ViewBar';
import { AppHeader } from './AppHeader';
import { AppDialogs } from './AppDialogs';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useUiLayout } from './useUiLayout';
import { layoutStyle } from './uiLayout';
import { PanelRail, Splitter, focusRail } from './PanelChrome';
import { InlineRename, type RenameTarget } from './InlineRename';
import { PresentLayer } from './PresentDock';
import { isPresenting } from './present';
import { usePresentKeys } from './usePresentKeys';
import type { IllustrationId } from '../engine/anim/illustrations';
import { PaletteSlot, PropsSlot, slot } from './ShellSlots';
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
  onCollapse?: () => void;
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
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
        {props.onCollapse && (
          <button
            type="button"
            class="panel-toggle"
            data-testid="collapse-sidebar"
            aria-label="Hide files panel"
            aria-expanded={true}
            onClick={() => {
              props.onCollapse?.();
              focusRail('sidebar');
            }}
          >
            ‹
          </button>
        )}
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
          illustration={props.illustration}
          onIllustration={props.onIllustration}
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
  codeCollapsed: boolean;
  onPresent: () => void;
  onToggleCode: () => void;
  onResizeCode: (dx: number) => void;
  onEndResizeCode: () => void;
}) {
  return (
    <div class="canvas-split">
      <main class="canvas-wrap">
        <svg ref={props.canvas.svgRef} class="pc-canvas" data-testid="canvas" width="100%" height="100%" />
        <PlayBar player={props.player} onPresent={props.onPresent} />
      </main>
      {props.codeCollapsed ? (
        <PanelRail id="code" label="code" onExpand={props.onToggleCode}>
          {/* the sync state must stay visible even with the pane collapsed */}
          <span
            class="rail-chip"
            data-testid="sync-state-rail"
            data-sync-state={props.code.snapshot.state}
          >
            {props.code.snapshot.state.slice(0, 1)}
          </span>
        </PanelRail>
      ) : (
        <>
          <Splitter
            id="code"
            label="Resize code panel"
            onResize={(dx) => props.onResizeCode(-dx)}
            onEnd={props.onEndResizeCode}
          />
          <CodePane
            machine={props.code.machine}
            snapshot={props.code.snapshot}
            onFormat={props.code.formatNow}
            onCollapse={props.onToggleCode}
          />
        </>
      )}
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

/** Files/flows sidebar (or its rail) — F-10 collapsible shell. */
function SidebarSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  sideTab: 'files' | 'flows';
  onTab: (t: 'files' | 'flows') => void;
  manager: WorkspaceManager;
  version: number;
  activePath: string | null;
  onText: (text: string) => void;
  onPlay: (flowKey: string) => void;
  illustration: IllustrationId | 'auto';
  onIllustration: (id: IllustrationId | 'auto') => void;
}) {
  return slot(
    props.ui.layout.panels.sidebar === 'collapsed',
    'sidebar',
    'files',
    () => props.ui.togglePanel('sidebar'),
    <SidePane
      tab={props.sideTab}
      onTab={props.onTab}
      manager={props.manager}
      version={props.version}
      activePath={props.activePath}
      onText={props.onText}
      onPlay={props.onPlay}
      onCollapse={() => props.ui.togglePanel('sidebar')}
      illustration={props.illustration}
      onIllustration={props.onIllustration}
    />,
  );
}

/** Screen-space box of the object being renamed (F-15 tracks pan/zoom). */
function renameBox(
  snap: Snapshot | null,
  svg: SVGSVGElement | null,
  id: string | null,
): RenameTarget | null {
  if (id === null || snap === null || svg === null) return null;
  const obj = snap.objects.find((o) => o.id === id);
  if (!obj) return null;
  const box = svg.getBoundingClientRect();
  const t = snap.viewport;
  return {
    id: obj.id,
    kind: obj.kind,
    name: obj.name ?? obj.id,
    left: box.left + t.x + obj.x * t.k,
    top: box.top + t.y + obj.y * t.k,
    width: Math.max(96, obj.w * t.k),
    height: Math.max(24, obj.h * t.k),
    zoom: t.k,
  };
}

/** Shell body: sidebar | palette | canvas (+code) | properties, each collapsible. */
function AppBody(p: {
  ws: ReturnType<typeof useWorkspace>;
  canvas: ReturnType<typeof useCanvasController>;
  code: CodeSyncHandle;
  ui: ReturnType<typeof useUiLayout>;
  player: FlowPlayerApi;
  activePath: string | null;
  viewName: string | undefined;
  onView: (n: string | undefined) => void;
  sideTab: 'files' | 'flows';
  onSideTab: (t: 'files' | 'flows') => void;
  /** F-16: enter presentation mode (PlayBar's present button). */
  onPresent: () => void;
  sel: ReturnType<typeof selections>;
  diverged: ReturnType<typeof useDivergedClose>;
  illustration: IllustrationId | 'auto';
  onIllustration: (id: IllustrationId | 'auto') => void;
}) {
  const { ws, canvas, code, ui, player, activePath, viewName } = p;
  const ctrl = canvas.ctrlRef.current;
  return (
      <div class="app-body">
        <SidebarSlot
          ui={ui}
          sideTab={p.sideTab}
          onTab={p.onSideTab}
          manager={ws.manager}
          version={ws.version}
          activePath={activePath}
          onText={(text) => code.machine.textChanged(text)}
          onPlay={(flowKey) => {
            if (activePath !== null) player.start(activePath, flowKey);
          }}
          illustration={p.illustration}
          onIllustration={p.onIllustration}
        />
        <Splitter
          id="sidebar"
          label="Resize files panel"
          onResize={(dx) => ui.setPanelWidth('sidebar', ui.layout.widths.sidebar + dx)}
          onEnd={ui.flushLayout}
        />
        <PaletteSlot
          ui={ui}
          onPlace={(k) => ctrl?.addObject(k)}
          onDragDrop={canvas.onPaletteDrop}
        />
        <Splitter
          id="palette"
          label="Resize shapes panel"
          onResize={(dx) => ui.setPanelWidth('palette', ui.layout.widths.palette + dx)}
          onEnd={ui.flushLayout}
        />
        <main class="canvas-col">
          <CanvasTopRow
            manager={ws.manager}
            diverged={p.diverged}
            activePath={activePath}
            viewName={viewName}
            onView={p.onView}
            onText={(t) => code.machine.textChanged(t)}
            ctrl={canvas.ctrlRef.current}
            selection={canvas.snap?.selection.objects ?? []}
          />
          <CanvasSplit
            canvas={canvas}
            code={code}
            player={player}
            codeCollapsed={ui.layout.panels.code === 'collapsed'}
            onPresent={p.onPresent}
            onToggleCode={() => ui.togglePanel('code')}
            onResizeCode={(dx) => ui.setPanelWidth('code', ui.layout.widths.code + dx)}
            onEndResizeCode={ui.flushLayout}
          />
        </main>
        <Splitter
          id="props"
          label="Resize properties panel"
          onResize={(dx) => ui.setPanelWidth('props', ui.layout.widths.props - dx)}
          onEnd={ui.flushLayout}
        />
        <div class="props-col">
          <PropsSlot
            ui={ui}
            obj={p.sel.obj}
            link={p.sel.link}
            nameFieldRef={canvas.nameFieldRef}
            onChangeObject={(id, patch) => ctrl?.updateObject(id, patch)}
            onChangeLink={(id, patch) => ctrl?.updateLink(id, patch)}
            onFit={() => ctrl?.fitSelection()}
            depsText={activePath !== null ? ws.manager.text(activePath) : null}
            viewName={viewName}
            activeId={p.sel.obj?.id ?? null}
            ctrl={canvas.ctrlRef.current}
            sections={ui.layout.sections}
            onToggleSection={ui.toggleSection}
          />
        </div>
      </div>
  );
}

export function App() {
  const ws = useWorkspace();
  // Ref mirror of the active view name (declared before the canvas so the
  // geometry-commit hook can target the right view — F-14).
  const viewNameRef = useRef<string | undefined>(undefined);
  // Filled once the code-sync hook exists (geometry commits must render the
  // code view too, not just write the file).
  const commitDocRef = useRef<((doc: import('../engine/model/types').Doc) => void) | null>(null);
  // F-15: which object is being renamed in place (null = no overlay)
  const [renaming, setRenaming] = useState<string | null>(null);
  // F-16: presentation is explicit (the inline playbar keeps the chrome)
  const [present, setPresent] = useState(false);
  const canvas = useCanvasController(
    ws.manager,
    ws.ready,
    ws.version,
    viewNameRef,
    commitDocRef,
    (id) => setRenaming(id),
  );
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
  commitDocRef.current = code.commitDoc;
  const [illustration, setIllustration] = useState<IllustrationId | 'auto'>('auto');
  const player = useFlowStage({ manager, canvas, activePath, illustration });
  const ui = useUiLayout(manager, ws.ready, ws.version);
  const sel = selections(canvas.snap);
  const renameTarget = renameBox(canvas.snap, canvas.svgRef.current, renaming);
  const presenting = present && isPresenting(player.state.status);
  usePresentKeys(player, presenting);
  // leaving playback always leaves presentation (Esc, exit button, flow end)
  useEffect(() => {
    if (!isPresenting(player.state.status)) setPresent(false);
  }, [player.state.status]);
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
    <div
      class={`app-shell${presenting ? ' presenting' : ''}`}
      data-presenting={presenting ? 'true' : 'false'}
      data-testid="app-shell"
      data-panels={Object.entries(ui.layout.panels).map(([k, v]) => `${k}:${v}`).join(',')}
      style={layoutStyle(ui.layout)}
    >
      <AppHeader
        ws={ws}
        svgRef={canvas.svgRef}
        onFlash={setFlash}
        onClearRequest={() => setClearOpen(true)}
        onSnapshotsRequest={() => setSnapsOpen(true)}
      />
      <AppBody
        ws={ws}
        canvas={canvas}
        code={code}
        ui={ui}
        player={player}
        activePath={activePath}
        viewName={viewName}
        onView={setViewName}
        sideTab={sideTab}
        onSideTab={setSideTab}
        onPresent={() => setPresent(true)}
        sel={sel}
        diverged={diverged}
        illustration={illustration}
        onIllustration={setIllustration}
      />
      {presenting && <PresentLayer player={player} />}
      {renameTarget && (
        <InlineRename
          target={renameTarget}
          onCommit={(name) => {
            canvas.ctrlRef.current?.updateObject(renameTarget.id, { name });
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
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
