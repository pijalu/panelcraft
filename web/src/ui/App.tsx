// SPDX-License-Identifier: GPL-3.0-only
// App shell (M3): file tree | tabs | palette | canvas | properties + toolbar.
// The canvas owns its imperative controller (ADR-0001: Preact renders chrome
// around the SVG, never inside it); the WorkspaceManager owns the virtual FS,
// tabs and autosave; chrome re-renders via manager.subscribe(). Lifecycle and
// sync wiring live in useWorkspace.ts; panels below are presentational.
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { labelFor, CanvasController, type DiagramLink, type Snapshot } from './CanvasController';
import { FileTree } from './FileTree';
import { Tabs } from './Tabs';
import { CodePane } from './CodePane';
import { FlowPane, type FlowCanvasContext, type FlowSelection } from './flows/FlowPane';
import { PlayBar } from './flows/PlayBar';
import { ViewBar } from './views/ViewBar';
import { AppHeader } from './AppHeader';
import { AppDialogs } from './AppDialogs';
import { AppOverlays } from './AppOverlays';
import { TemplateOverlay } from './EmptyState';
import type { RenameTarget } from './InlineRename';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useUiLayout } from './useUiLayout';
import { useAppTheme } from './useAppTheme';
import { useHistory } from './useHistory';
import { useViewSession } from './useViewSession';
import type { HoverInfo } from './hoverInfo';
import { layoutStyle, PANELS, type DockId, type PanelId } from './uiLayout';
import { CollapseButton, PanelRail } from './PanelChrome';
import { CanvasMenu } from './CanvasMenu';
import { MiniMap } from './MiniMap';
import { s } from './strings';
import { ShellBanners } from './ShellBanners';
import { DropZone, HostedPanel } from './WorkspacePanels';
import { useCanvasRevealPort } from './useCanvasReveal';
import { usePresentation } from './usePresentation';
import type { IllustrationId } from '../engine/anim/illustrations';
import { PaletteSlot, PropsSlot, slot } from './ShellSlots';
import { useCodeSync } from './useCodeSync';
import { useShellLifecycle } from './useShellLifecycle';
import type { useDivergedClose } from './useDivergedClose';
import { useFlowStage } from './useFlowStage';
import { useDrawer } from './useDrawer';

import type { FlowPlayerApi } from './flows/useFlowPlayer';
import type { CodeSyncHandle } from './useCodeSync';
import type { WorkspaceManager } from '../workspace/workspace';

/** Single-selection for the properties panel (obj xor link). */
function selections(snap: Snapshot | null): { obj: ReturnType<typeof findObj>; link: ReturnType<typeof findLink> } {
  return { obj: findObj(snap), link: findLink(snap) };
}

/** FLOW-01: what the canvas currently offers the flow editor. */
function canvasContext(snap: Snapshot | null, link: DiagramLink | null): FlowCanvasContext {
  return {
    objects: snap?.selection.objects ?? [],
    link:
      link === null
        ? null
        : { id: link.id, from: link.from, to: link.to, ...(link.label === undefined ? {} : { label: link.label }) },
  };
}

/** FLOW-01: fade everything except the selected card's participants. */
function highlightParticipants(
  canvas: ReturnType<typeof useCanvasController>,
  ids: string[] | null,
): void {
  const ctrl = canvas.ctrlRef.current;
  const snap = canvas.snap;
  if (ctrl === null || snap === null) return;
  if (ids === null) {
    ctrl.setFaded([], []);
    return;
  }
  const keep = new Set(ids);
  ctrl.setFaded(
    snap.objects.filter((o) => !keep.has(o.id)).map((o) => o.id),
    snap.links.filter((l) => !keep.has(l.from) || !keep.has(l.to)).map((l) => l.id),
  );
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

/** Independent browser-local file tree; closing it never touches workspace tabs. */
function FilesPane(props: {
  manager: WorkspaceManager;
  version: number;
  onCollapse: () => void;
}) {
  return (
    <aside class="sidebar" aria-label={s('Workspace files')}>
      {/* WP02: the host header already names the panel; keep only the collapse control. */}
      <div class="panel-head">
        <CollapseButton id="sidebar" label={s('files')} onCollapse={props.onCollapse} />
      </div>
      <FileTree
        manager={props.manager}
        version={props.version}
        onOpen={(path) => props.manager.openFile(path)}
      />
    </aside>
  );
}

/** Flow editor hosted separately from Files (FLOW-01 dependency). */
function FlowStepsPane(props: {
  manager: WorkspaceManager;
  version: number;
  activePath: string | null;
  onText(text: string): void;
  onPlay(flowKey: string): void;
  onCollapse: () => void;
  illustration: IllustrationId | 'auto';
  onIllustration(id: IllustrationId | 'auto'): void;
  onPlayFrom(flowKey: string, index: number): void;
  dirty: boolean;
  selection: FlowSelection | null;
  onSelection(selection: FlowSelection): void;
  canvasContext: FlowCanvasContext;
  onHighlight(ids: string[] | null): void;
}) {
  return (
    <aside class="sidebar" aria-label={s('Flow step editor')}>
      {/* WP02: host header owns the title; no duplicate heading here. */}
      <div class="panel-head">
        <CollapseButton id="flows" label={s('flow steps')} onCollapse={props.onCollapse} />
      </div>
      <FlowPane
        textOf={(path) => props.manager.text(path)}
        activePath={props.activePath}
        version={props.version}
        onChangeText={props.onText}
        onPlay={props.onPlay}
        illustration={props.illustration}
        onIllustration={props.onIllustration}
        onPlayFrom={props.onPlayFrom}
        dirty={props.dirty}
        selection={props.selection}
        onSelection={props.onSelection}
        canvas={props.canvasContext}
        onHighlight={props.onHighlight}
      />
    </aside>
  );
}

/** Canvas surface; Code is an independently dockable workspace panel (UX-02). */
function CanvasSplit(props: {
  canvas: ReturnType<typeof useCanvasController>;
  player: FlowPlayerApi;
  onPresent: () => void;
  onCanvasContextMenu: (e: MouseEvent) => void;
}) {
  return (
    <main class="canvas-wrap" onContextMenu={props.onCanvasContextMenu}>
      <svg ref={props.canvas.svgRef} class="pc-canvas" data-testid="canvas" width="100%" height="100%" />
      <MiniMap
        snapshot={props.canvas.snap}
        controller={props.canvas.ctrlRef.current}
        canvasElement={props.canvas.svgRef.current}
        viewSize={{ w: 800, h: 600 }}
      />
      <PlayBar player={props.player} onPresent={props.onPresent} />
    </main>
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

/** Independent Files browser (or its rail). */
function SidebarSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  manager: WorkspaceManager;
  version: number;
}) {
  return slot(
    props.ui.layout.panels.sidebar === 'collapsed',
    'sidebar',
    'files',
    () => props.ui.togglePanel('sidebar'),
    <FilesPane
      manager={props.manager}
      version={props.version}
      onCollapse={() => props.ui.togglePanel('sidebar')}
    />,
  );
}

/** Independent Flow Steps editor (or its rail). */
function FlowSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  manager: WorkspaceManager;
  version: number;
  activePath: string | null;
  onText: (text: string) => void;
  onPlay: (flowKey: string) => void;
  illustration: IllustrationId | 'auto';
  onIllustration: (id: IllustrationId | 'auto') => void;
  onPlayFrom: (flowKey: string, index: number) => void;
  dirty: boolean;
  selection: FlowSelection | null;
  onSelection: (selection: FlowSelection) => void;
  canvasContext: FlowCanvasContext;
  onHighlight: (ids: string[] | null) => void;
}) {
  return slot(
    props.ui.layout.panels.flows === 'collapsed',
    'flows',
    'flow steps',
    () => props.ui.togglePanel('flows'),
    <FlowStepsPane
      manager={props.manager}
      version={props.version}
      activePath={props.activePath}
      onText={props.onText}
      onPlay={props.onPlay}
      onCollapse={() => props.ui.togglePanel('flows')}
      illustration={props.illustration}
      onIllustration={props.onIllustration}
      onPlayFrom={props.onPlayFrom}
      dirty={props.dirty}
      selection={props.selection}
      onSelection={props.onSelection}
      canvasContext={props.canvasContext}
      onHighlight={props.onHighlight}
    />,
  );
}

function CodeSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  code: CodeSyncHandle;
  revealRef: { current: ((id: string) => void) | null };
  onCaretObject: (id: string | null) => void;
}) {
  if (props.ui.layout.panels.code === 'collapsed') {
    return (
      <PanelRail id="code" label={s('code')} onExpand={() => props.ui.togglePanel('code')}>
        <span
          class="rail-chip"
          data-testid="sync-state-rail"
          data-sync-state={props.code.snapshot.state}
        >
          {props.code.snapshot.state.slice(0, 1)}
        </span>
      </PanelRail>
    );
  }
  return (
    <CodePane
      machine={props.code.machine}
      snapshot={props.code.snapshot}
      onFormat={props.code.formatNow}
      onCollapse={() => props.ui.togglePanel('code')}
      revealRef={props.revealRef}
      onCaretObject={props.onCaretObject}
    />
  );
}

/** F-18: start a flow at a step (no-op without an active file). */
function playFrom(
  player: FlowPlayerApi,
  activePath: string | null,
  flowKey: string,
  index: number,
): void {
  if (activePath === null) return;
  player.start(activePath, flowKey);
  player.stepTo(index);
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

/** Wipe the workspace: forget the canvas state, clear storage, close the dialog. */
function clearWorkspace(
  manager: WorkspaceManager,
  canvas: ReturnType<typeof useCanvasController>,
  done: () => void,
): void {
  canvas.resync();
  void manager.clearAll();
  done();
}

/** F-25: status-pill inputs (dirty / last save / problem count). */
function statusProps(
  snapshot: CodeSyncHandle['snapshot'],
  ready: boolean,
  manager: WorkspaceManager,
): { dirty: boolean; savedAt: number | null; problems: number } {
  return {
    dirty: snapshot.divergedFromSaved,
    savedAt: ready ? manager.lastSavedAt || null : null,
    problems: snapshot.state === 'error' ? snapshot.diagnostics.length : 0,
  };
}

/** FLOW-01: Flow Steps panel element, wired to canvas context and playback. */
function flowsSlot(
  p: {
    ui: ReturnType<typeof useUiLayout>;
    canvas: ReturnType<typeof useCanvasController>;
    code: CodeSyncHandle;
    activePath: string | null;
    sel: ReturnType<typeof selections>;
    illustration: IllustrationId | 'auto';
    onIllustration: (id: IllustrationId | 'auto') => void;
    flowSelection: FlowSelection | null;
    onFlowSelection: (selection: FlowSelection) => void;
    manager: WorkspaceManager;
    version: number;
    player: FlowPlayerApi;
  },
): ComponentChildren {
  return (
    <FlowSlot
      ui={p.ui}
      manager={p.manager}
      version={p.version}
      activePath={p.activePath}
      onText={(text) => p.code.machine.textChanged(text)}
      onPlay={(flowKey) => {
        if (p.activePath !== null) p.player.start(p.activePath, flowKey);
      }}
      illustration={p.illustration}
      onIllustration={p.onIllustration}
      onPlayFrom={(flowKey, index) => playFrom(p.player, p.activePath, flowKey, index)}
      dirty={p.code.snapshot.divergedFromSaved}
      selection={p.flowSelection}
      onSelection={p.onFlowSelection}
      canvasContext={canvasContext(p.canvas.snap, p.sel.link)}
      onHighlight={(ids) => highlightParticipants(p.canvas, ids)}
    />
  );
}

/** Shell body with recoverable left/right/bottom docks and floating panels. */
function AppBody(p: {
  ws: ReturnType<typeof useWorkspace>;
  canvas: ReturnType<typeof useCanvasController>;
  code: CodeSyncHandle;
  ui: ReturnType<typeof useUiLayout>;
  player: FlowPlayerApi;
  activePath: string | null;
  viewName: string | undefined;
  onView: (n: string | undefined) => void;
  onPresent: () => void;
  sel: ReturnType<typeof selections>;
  diverged: ReturnType<typeof useDivergedClose>;
  illustration: IllustrationId | 'auto';
  onIllustration: (id: IllustrationId | 'auto') => void;
  dirty: boolean; flowSelection: FlowSelection | null;
  onFlowSelection: (selection: FlowSelection) => void;
  revealRef: { current: ((id: string) => void) | null };
}) {
  const { ws, canvas, code, ui, player, activePath, viewName } = p;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ctrl = canvas.ctrlRef.current;
  const { drawer, dismiss } = useDrawer(ui);
  const content: Record<PanelId, ComponentChildren> = {
    sidebar: <SidebarSlot ui={ui} manager={ws.manager} version={ws.version} />,
    flows: flowsSlot({
      ui,
      canvas,
      code,
      activePath,
      sel: p.sel,
      illustration: p.illustration,
      onIllustration: p.onIllustration,
      flowSelection: p.flowSelection,
      onFlowSelection: p.onFlowSelection,
      manager: ws.manager,
      version: ws.version,
      player,
    }),
    palette: <PaletteSlot ui={ui} onPlace={(kind) => ctrl?.addObject(kind)} onDragDrop={canvas.onPaletteDrop} />,
    code: (
      <CodeSlot
        ui={ui}
        code={code}
        revealRef={p.revealRef}
        onCaretObject={(id) => {
          if (id !== null) ctrl?.setSelection([id]);
        }}
      />
    ),
    props: (
      <PropsSlot
        ui={ui}
        obj={p.sel.obj}
        link={p.sel.link}
        nameFieldRef={canvas.nameFieldRef}
        onChangeObject={(id, patch) => ctrl?.updateObject(id, patch)}
        onChangeLink={(id, patch) => ctrl?.updateLink(id, patch)}
        onFit={() => ctrl?.fitSelection()}
        depsText={activePath !== null ? ws.manager.text(activePath) : null}
        activePath={activePath}
        viewName={viewName}
        activeId={p.sel.obj?.id ?? null}
        ctrl={ctrl}
        sections={ui.layout.sections}
        onToggleSection={ui.toggleSection}
      />
    ),
  };
  const docked = (dock: DockId) =>
    PANELS.filter((panel) => ui.layout.docks[panel] === dock)
      .sort((a, b) => ui.layout.order[a] - ui.layout.order[b])
      .map((panel) => (
        <HostedPanel key={panel} id={panel} ui={ui}>
          {content[panel]}
        </HostedPanel>
      ));
  return (
    <div class="app-body" data-drawer={drawer === null ? undefined : 'open'}>
      {drawer !== null && (
        <div class="drawer-backdrop" data-testid="drawer-backdrop" onClick={dismiss} />
      )}
      <ShellBanners
        snapshot={code.snapshot}
        ctrlRef={canvas.ctrlRef}
        manager={ws.manager}
        ready={ws.ready}
        activePath={activePath}
        version={ws.version}
      />
      <DropZone dock="left" onMove={ui.movePanel}>{docked('left')}</DropZone>
      <CenterColumn
        canvas={canvas}
        code={code}
        player={player}
        manager={ws.manager}
        diverged={p.diverged}
        activePath={activePath}
        viewName={viewName}
        onView={p.onView}
        onPresent={p.onPresent}
        onCanvasContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      />
      <DropZone dock="right" onMove={ui.movePanel}>{docked('right')}</DropZone>
      <DropZone dock="bottom" onMove={ui.movePanel}>{docked('bottom')}</DropZone>
      <div class="floating-layer">{docked('float')}</div>
      {menu && ctrl && (
        <CanvasMenu
          ctrl={ctrl}
          x={menu.x}
          y={menu.y}
          selectionCount={canvas.snap?.selection.objects.length ?? 0}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** Canvas column; Code is hosted independently by AppBody (UX-02). */
function CenterColumn(props: {
  canvas: ReturnType<typeof useCanvasController>;
  code: CodeSyncHandle;
  player: FlowPlayerApi;
  manager: WorkspaceManager;
  diverged: ReturnType<typeof useDivergedClose>;
  activePath: string | null;
  viewName: string | undefined;
  onView: (n: string | undefined) => void;
  onPresent: () => void;
  onCanvasContextMenu: (e: MouseEvent) => void;
}) {
  const { canvas, code, player } = props;
  return (
    <main class="canvas-col">
      <TemplateOverlay
        show={(props.canvas.snap?.objects.length ?? 0) === 0}
        onInsert={(t) => props.code.machine.textChanged(t.text)}
      />
      <CanvasTopRow
        manager={props.manager}
        diverged={props.diverged}
        activePath={props.activePath}
        viewName={props.viewName}
        onView={props.onView}
        onText={(t) => code.machine.textChanged(t)}
        ctrl={canvas.ctrlRef.current}
        selection={canvas.snap?.selection.objects ?? []}
      />
      <CanvasSplit
        canvas={canvas}
        player={player}
        onPresent={props.onPresent}
        onCanvasContextMenu={props.onCanvasContextMenu}
      />
    </main>
  );
}

export function App() {
  const ws = useWorkspace();
  const activePath = ws.ready ? ws.manager.activePath : null;
  const view = useViewSession(activePath);
  const [renaming, setRenaming] = useState<string | null>(null); // F-15 inline rename
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const canvas = useCanvasController(
    ws.manager,
    ws.ready,
    ws.version,
    view.viewNameRef,
    view.commitDocRef,
    (id) => setRenaming(id),
    // F-20: clicking an imported ghost opens its source file
    (path) => ws.manager.openFile(path),
    // F-25: hover info card
    (info) => setHover(info),
  );
  const { manager } = ws;
  const [clearOpen, setClearOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [snapsOpen, setSnapsOpen] = useState(false);
  const { viewName, setViewName } = view;
  const code = useCodeSync({
    manager: ws.manager,
    ready: ws.ready,
    activePath,
    version: ws.version,
    ctrlRef: canvas.ctrlRef,
    snap: canvas.snap,
    viewRef: view.viewNameRef,
  });
  view.commitDocRef.current = code.commitDoc;
  const [illustration, setIllustration] = useState<IllustrationId | 'auto'>('auto');
  const [flowSelection, setFlowSelection] = useState<FlowSelection | null>(null);
  const player = useFlowStage({ manager, canvas, activePath, illustration });
  const ui = useUiLayout(manager, ws.ready, ws.version);
  const appTheme = useAppTheme(manager, ws.ready, ws.version);
  const history = useHistory(canvas.ctrlRef, code.snapshot, canvas.ctrlRef.current !== null, setFlash);
  const [historyOpen, setHistoryOpen] = useState(false);
  const revealRef = useCanvasRevealPort(canvas.snap); // F-22 canvas → code
  const sel = selections(canvas.snap);
  const renameTarget = renameBox(canvas.snap, canvas.svgRef.current, renaming);
  const pres = usePresentation(player);

  const { diverged, pwa } = useShellLifecycle({
    manager: ws.manager,
    activePath,
    machine: code.machine,
    snapshot: code.snapshot,
    busy: pres.presenting || player.state.status === 'playing',
    onFlash: setFlash,
  });

  return (
    <div
      class={`app-shell${pres.presenting ? ' presenting' : ''}`}
      data-presenting={pres.presenting ? 'true' : 'false'}
      data-testid="app-shell"
      data-panels={Object.entries(ui.layout.panels).map(([k, v]) => `${k}:${v}`).join(',')}
      style={layoutStyle(ui.layout)}
    >
      <AppHeader
        ws={ws}
        ui={ui}
        theme={appTheme}
        svgRef={canvas.svgRef}
        onFlash={setFlash}
        onClearRequest={() => setClearOpen(true)}
        onSnapshotsRequest={() => setSnapsOpen(true)}
        {...statusProps(code.snapshot, ws.ready, manager)}
        onHistoryRequest={() => setHistoryOpen(true)}
        onPresentRequest={pres.start}
        pwa={pwa}
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
        onPresent={pres.start}
        sel={sel}
        diverged={diverged}
        illustration={illustration}
        onIllustration={setIllustration}
        dirty={code.snapshot.divergedFromSaved}
        flowSelection={flowSelection}
        onFlowSelection={setFlowSelection}
        revealRef={revealRef}
      />
      <AppOverlays
        hover={hover}
        presenting={pres.presenting}
        player={player}
        renameTarget={renameTarget}
        onRenameCommit={(name) => {
          if (renameTarget !== null) canvas.ctrlRef.current?.updateObject(renameTarget.id, { name });
          setRenaming(null);
        }}
        onRenameCancel={() => setRenaming(null)}
      />
      <AppDialogs
        manager={manager}
        activePath={activePath}
        ctrlRef={canvas.ctrlRef}
        diverged={diverged}
        clearOpen={clearOpen}
        clearData={() => clearWorkspace(manager, canvas, () => setClearOpen(false))}
        onClearCancel={() => setClearOpen(false)}
        flash={flash}
        onFlashDismiss={() => setFlash(null)}
        {...{ historyOpen, history, onHistoryClose: () => setHistoryOpen(false) }}
        snapsOpen={snapsOpen}
        onSnapsClose={() => setSnapsOpen(false)}
      />
    </div>
  );
}

export { labelFor };
