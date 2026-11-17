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
import { FlowPane, type FlowCanvasContext, type FlowSelection, type ViewPoint } from './flows/FlowPane';
import { invert } from '../engine/render/viewport';
import { PlayBar } from './flows/PlayBar';
import { useStagePresentation } from './useStagePresentation';
import { AppHeader } from './AppHeader';
import { AppDialogs } from './AppDialogs';
import { AppOverlays } from './AppOverlays';
import { TemplateOverlay } from './EmptyState';
import type { RenameTarget } from './InlineRename';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useUiLayout } from './useUiLayout';
import { useAppTheme } from './useAppTheme';
import { useCanvasGrid } from './useCanvasGrid';
import { useHistory } from './useHistory';
import { useShellUi } from './useShellUi';
import { layoutStyle, PANELS, type DockId, type PanelId } from './uiLayout';
import { CollapseButton, PanelRail } from './PanelChrome';
import { CanvasMenu } from './CanvasMenu';
import { useDiagramCommands } from './useDiagramCommands';
import type { CommandSelection } from './commandPolicy';
import { MiniMap } from './MiniMap';
import { s } from './strings';
import type { Doc, IconDecl, Obj } from '../engine/model/types';
import { DrillBar } from './DrillBar';
import { SourceViewer } from './SourceViewer';
import { useDrillLayer, type DrillLayer, type DrilldownHandle } from './useDrilldown';
import { useDocumentPipeline } from './useDocumentPipeline';
import { useActiveDocument, useEmbeddedTree } from './useDocumentSource';
import type { DocumentRef } from '../workspace/documents';
import type { DocumentSource } from './useDocumentSource';
import { ShellBanners } from './ShellBanners';
import { DropZone, HostedPanel } from './WorkspacePanels';
import { useCanvasRevealPort } from './useCanvasReveal';
import type { IllustrationId } from '../engine/anim/illustrations';
import { PaletteSlot, PropsSlot, slot } from './ShellSlots';
import { useShellLifecycle } from './useShellLifecycle';
import type { useDivergedClose } from './useDivergedClose';
import { useFlowStage } from './useFlowStage';
import { useDrawer } from './useDrawer';
import { useShellDialogs } from './useShellDialogs';

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

/** UX08-WP13: viewport centre in canvas coordinates + zoom ("use current view"). */
function currentViewOf(canvas: ReturnType<typeof useCanvasController>): () => ViewPoint | null {
  return () => {
    const ctrl = canvas.ctrlRef.current;
    const svg = canvas.svgRef.current;
    if (ctrl === null || svg === null) return null;
    const v = ctrl.viewport;
    const c = invert(v, { x: svg.clientWidth / 2, y: svg.clientHeight / 2 });
    return { x: Math.round(c.x), y: Math.round(c.y), k: Math.round(v.k * 100) / 100 };
  };
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
  embedded: ReturnType<typeof useEmbeddedTree>;
  activeRef: DocumentRef | null;
  onOpenRef: (ref: DocumentRef) => void;
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
        embedded={props.embedded}
        embeddedRoot={props.activeRef?.root ?? props.manager.activePath}
        activeRef={props.activeRef}
        onOpenRef={props.onOpenRef}
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
  source?: DocumentSource;
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
  currentView?: () => ViewPoint | null;
}) {
  return (
    <aside class="sidebar" aria-label={s('Flow step editor')}>
      {/* WP02: host header owns the title; no duplicate heading here. */}
      <div class="panel-head">
        <CollapseButton id="flows" label={s('flow steps')} onCollapse={props.onCollapse} />
      </div>
      <FlowPane
        textOf={(path) => path === props.source?.label
          ? props.source.text
          : (props.manager.hasFile(path) ? props.manager.text(path) : null)}
        activePath={props.source?.label ?? props.activePath}
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
        files={props.manager.files().map((file) => file.path)}
        onHighlight={props.onHighlight}
        {...(props.currentView === undefined ? {} : { currentView: props.currentView })}
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
      {/* Item 7: focusable (not tabbable) so closing a menu can restore focus
          to the canvas the user invoked it from. */}
      <svg
        ref={props.canvas.svgRef}
        class="pc-canvas"
        data-testid="canvas"
        width="100%"
        height="100%"
        tabindex={-1}
      />
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

/** Tab strip above the canvas (extracted to keep App under the length gate). */
function CanvasTopRow(props: {
  manager: WorkspaceManager;
  diverged: ReturnType<typeof useDivergedClose>;
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
    </>
  );
}

/** Independent Files browser (or its rail). */
function SidebarSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  manager: WorkspaceManager;
  version: number;
  embedded: ReturnType<typeof useEmbeddedTree>;
  activeRef: DocumentRef | null;
  onOpenRef: (ref: DocumentRef) => void;
}) {
  return slot(
    props.ui.layout.panels.sidebar === 'collapsed',
    'sidebar',
    'files',
    () => props.ui.togglePanel('sidebar'),
    <FilesPane
      manager={props.manager}
      version={props.version}
      embedded={props.embedded}
      activeRef={props.activeRef}
      onOpenRef={props.onOpenRef}
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
  source?: DocumentSource;
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
  currentView?: () => ViewPoint | null;
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
      {...(props.currentView === undefined ? {} : { currentView: props.currentView })}
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
      <PanelRail id="code" labelKey="code" onExpand={() => props.ui.togglePanel('code')}>
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
  player.playFrom(index);
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
    source?: DocumentSource;
    sel: ReturnType<typeof selections>;
    illustration: IllustrationId | 'auto';
    onIllustration: (id: IllustrationId | 'auto') => void;
    flowSelection: FlowSelection | null;
    onFlowSelection: (selection: FlowSelection) => void;
    manager: WorkspaceManager;
    version: number;
    player: FlowPlayerApi;
    currentView?: () => ViewPoint | null;
  },
): ComponentChildren {
  return (
    <FlowSlot
      ui={p.ui}
      manager={p.manager}
      version={p.version}
      activePath={p.source?.label ?? p.activePath}
      source={p.source}
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
      {...(p.currentView === undefined ? {} : { currentView: p.currentView })}
    />
  );
}

function hierarchyFor(p: Parameters<typeof propsSlot>[0], selected: ReturnType<typeof findObj>) {
  if (selected === null || p.drill === undefined) return undefined;
  const stored = p.doc?.objects.find((o) => o.id === selected.id);
  return {
    target: p.drill.targetOf(selected.id),
    candidates: p.drill.candidates(selected.id),
    onSet: (path: string | null) => p.drill?.setDrilldown(selected.id, path),
    onOpen: () => p.drill?.drill(selected.id),
    hasSource: stored?.source !== undefined,
    language: stored?.source?.language,
    onOpenSource: () => p.onSourceOpen?.(selected.id),
  };
}

/** UX08-WP08: Properties + dependencies slot, wired to canvas edits and focus. */
function propsSlot(p: {
  canvas: ReturnType<typeof useCanvasController>;
  ui: ReturnType<typeof useUiLayout>;
  manager: WorkspaceManager;
  sel: ReturnType<typeof selections>;
  activePath: string | null;
  source?: DocumentSource;
  linkLabelRef: { current: HTMLInputElement | null };
  projectIcons?: IconDecl[];
  onManageIcons?: () => void;
  drill?: DrilldownHandle;
  doc?: Doc | null;
  onSourceOpen?: (objectId: string) => void;
}): ComponentChildren {
  const ctrl = p.canvas.ctrlRef.current;
  const hierarchy = hierarchyFor(p, p.sel.obj);
  return (
    <PropsSlot
      ui={p.ui}
      obj={p.sel.obj}
      link={p.sel.link}
      nameFieldRef={p.canvas.nameFieldRef}
      linkLabelRef={p.linkLabelRef}
      onChangeObject={(id, patch) => ctrl?.updateObject(id, patch)}
      onChangeLink={(id, patch) => ctrl?.updateLink(id, patch)}
      onChangeAnchor={(id, end, anchor) => ctrl?.setLinkAnchor(id, end, anchor)}
      onResetRoute={(id) => ctrl?.resetLinkRoute(id)}
      onResetBends={(id) => ctrl?.resetLinkBends(id)}
      onFit={() => ctrl?.fitSelection()}
      depsText={p.source?.text ?? (p.activePath !== null ? p.manager.text(p.activePath) : null)}
      activePath={p.source?.label ?? p.activePath}
      activeId={p.sel.obj?.id ?? null}
      ctrl={ctrl}
      sections={p.ui.layout.sections}
      onToggleSection={p.ui.toggleSection}
      projectIcons={p.projectIcons}
      onManageIcons={p.onManageIcons}
      hierarchy={hierarchy}
    />
  );
}

/** Render one dock with all its collapsed tabs in a single shared column. */
function dockedPanels(
  dock: DockId,
  ui: ReturnType<typeof useUiLayout>,
  content: Record<PanelId, ComponentChildren>,
): ComponentChildren {
  const panels = PANELS.filter((panel) => ui.layout.docks[panel] === dock)
    .sort((a, b) => ui.layout.order[a] - ui.layout.order[b]);
  const collapsed = panels.filter((panel) => ui.layout.panels[panel] === 'collapsed' && dock !== 'float');
  const renderPanel = (panel: PanelId) => (
    <HostedPanel key={panel} id={panel} ui={ui}>
      {content[panel]}
    </HostedPanel>
  );
  let groupRendered = false;
  return panels.map((panel) => {
    if (!collapsed.includes(panel)) return renderPanel(panel);
    if (groupRendered) return null;
    groupRendered = true;
    return (
      <div
        key={`collapsed-rail-${dock}`}
        class="panel-rail-group"
        data-testid={`collapsed-rail-${dock}`}
        data-dock={dock}
      >
        {collapsed.map(renderPanel)}
      </div>
    );
  });
}

/** Embedded-source dialog of the open element (IR v10, FILE-FORMAT.md §3.3). */
function SourceLayer(props: { layer: DrillLayer; obj: Obj | null }): ComponentChildren {
  const { layer, obj } = props;
  if (obj === null) return null;
  return (
    <SourceViewer
      obj={obj}
      onSave={(source) => layer.drill.setSource(obj.id, source)}
      onClose={layer.closeSource}
    />
  );
}

/**
 * Panel content of the shell body. Extracted so `AppBody` stays inside the
 * function-length gate and each panel's wiring is one screen away from the dock
 * code that hosts it.
 */
function bodyPanels(
  p: Parameters<typeof AppBody>[0],
  ctrl: CanvasController | null,
): Record<PanelId, ComponentChildren> {
  const { ws, canvas, code, ui, player, activePath, source, embedded } = p;
  return {
    sidebar: (
      <SidebarSlot
        ui={ui}
        manager={ws.manager}
        version={ws.version}
        embedded={embedded}
        activeRef={source.ref}
        onOpenRef={p.onOpenRef}
      />
    ),
    flows: flowsSlot({
      ui,
      canvas,
      code,
      activePath,
      source,
      sel: p.sel,
      illustration: p.illustration,
      onIllustration: p.onIllustration,
      flowSelection: p.flowSelection,
      onFlowSelection: p.onFlowSelection,
      manager: ws.manager,
      version: ws.version,
      player,
      currentView: currentViewOf(canvas),
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
    props: propsSlot({
      canvas,
      ui,
      manager: ws.manager,
      sel: p.sel,
      activePath,
      source,
      linkLabelRef: p.linkLabelRef,
      projectIcons: p.projectIcons,
      onManageIcons: p.onManageIcons,
      drill: p.drill,
      doc: p.doc,
      onSourceOpen: p.onSourceOpen,
    }),
  };
}

/** Shell body with recoverable left/right/bottom docks and floating panels. */
function AppBody(p: {
  ws: ReturnType<typeof useWorkspace>;
  canvas: ReturnType<typeof useCanvasController>;
  code: CodeSyncHandle;
  ui: ReturnType<typeof useUiLayout>;
  player: FlowPlayerApi;
  activePath: string | null;
  source: DocumentSource;
  embedded: ReturnType<typeof useEmbeddedTree>;
  onOpenRef: (ref: DocumentRef) => void;
  onPresent: () => void;
  sel: ReturnType<typeof selections>;
  diverged: ReturnType<typeof useDivergedClose>;
  illustration: IllustrationId | 'auto';
  onIllustration: (id: IllustrationId | 'auto') => void;
  dirty: boolean; flowSelection: FlowSelection | null;
  onFlowSelection: (selection: FlowSelection) => void;
  revealRef: { current: ((id: string) => void) | null };
  /** Link Label field, focused when a link is inspected. */
  linkLabelRef: { current: HTMLInputElement | null };
  /** IR v9: icons declared in the open file, and the manager trigger. */
  projectIcons: IconDecl[];
  onManageIcons: () => void;
  /** IR v10: drill-down trail, findings and the two hierarchy edits. */
  drill: DrilldownHandle;
  /** Parsed document of the open file (hierarchy + source authoring). */
  doc: Doc | null;
  onSourceOpen: (objectId: string) => void;
  onResetDiagramLayout: () => void;
  selection: CommandSelection;
}) {
  const { ws, canvas, code, ui, player, activePath } = p;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ctrl = canvas.ctrlRef.current;
  const { drawer, dismiss } = useDrawer(ui);
  const content = bodyPanels(p, ctrl);
  const docked = (dock: DockId) => dockedPanels(dock, ui, content);
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
        onPresent={p.onPresent}
        drill={p.drill}
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
          linkCount={canvas.snap?.selection.links.length ?? 0}
          selection={p.selection}
          onResetDiagramLayout={p.onResetDiagramLayout}
          onClose={() => {
            setMenu(null);
            // The invoking surface is this canvas, whatever held focus before
            // (the code editor often does). Restoring focus must not change the
            // selection or create undo history, and it runs after the surface
            // unmounts: removing the focused menu item sends focus to <body>,
            // which would undo a synchronous restore.
            const canvasEl = canvas.svgRef.current;
            requestAnimationFrame(() => canvasEl?.focus());
          }}
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
  onPresent: () => void;
  drill: DrilldownHandle;
  onCanvasContextMenu: (e: MouseEvent) => void;
}) {
  const { canvas, player } = props;
  const parent = props.drill.parent;
  return (
    <main class="canvas-col" data-parent={parent === undefined ? undefined : parent.label}>
      <TemplateOverlay
        show={(props.canvas.snap?.objects.length ?? 0) === 0}
        onInsert={(t) => props.code.machine.textChanged(t.text)}
      />
      <CanvasTopRow
        manager={props.manager}
        diverged={props.diverged}
      />
      <DrillBar drill={props.drill} />
      <CanvasSplit
        canvas={canvas}
        player={player}
        onPresent={props.onPresent}
        onCanvasContextMenu={props.onCanvasContextMenu}
      />
    </main>
  );
}

function useDialogsAndTheme(manager: WorkspaceManager, ready: boolean, version: number) {
  const dialogs = useShellDialogs();
  const theme = useAppTheme(manager, ready, version);
  return { dialogs, theme };
}

function useShellLayout(
  manager: WorkspaceManager,
  ready: boolean,
  version: number,
) {
  return { grid: useCanvasGrid(manager, ready, version), ui: useUiLayout(manager, ready, version) };
}

function useFlowPresentation(
  manager: WorkspaceManager,
  canvas: ReturnType<typeof useCanvasController>,
  activePath: string | null,
  illustration: IllustrationId | 'auto',
  ready: boolean,
) {
  const player = useFlowStage({ manager, canvas, activePath, illustration });
  const pres = useStagePresentation({
    player, activePath, ready, textOf: (path) => manager.text(path),
  });
  return { player, pres };
}

function useHistoryAndReveal(
  canvas: ReturnType<typeof useCanvasController>,
  snapshot: CodeSyncHandle['snapshot'],
  setFlash: (message: string | null) => void,
) {
  return {
    history: useHistory(canvas.ctrlRef, snapshot, canvas.ctrlRef.current !== null, setFlash),
    revealRef: useCanvasRevealPort(canvas.snap),
  };
}

export function App() {
  const ws = useWorkspace();
  const activePath = ws.ready ? ws.manager.activePath : null;
  const shell = useShellUi();
  const { renaming, setRenaming, hover, setHover, illustration, setIllustration,
    flowSelection, setFlowSelection, historyOpen, setHistoryOpen } = shell;
  const { grid, ui } = useShellLayout(ws.manager, ws.ready, ws.version);
  const { manager } = ws;
  const { source, embedded, setRef: setDocRef } = useActiveDocument(manager, activePath, ws.version);
  const { canvas, inspect, code, icons } = useDocumentPipeline({
    ws, ui, grid, activePath, source,
    onRename: setRenaming, // inline rename request from the canvas
    onGhostOpen: (path) => ws.manager.openFile(path), // F-20
    onHover: setHover, // hover card content
  });
  const layer = useDrillLayer({
    activePath, manager, version: ws.version, revision: code.snapshot,
    ctrlRef: canvas.ctrlRef, commitDoc: code.commitDoc,
    openFile: (path) => manager.openFile(path),
    source, setRef: setDocRef,
  });
  const { dialogs, theme: appTheme } = useDialogsAndTheme(manager, ws.ready, ws.version);
  const { clearOpen, setClearOpen, snapsOpen, setSnapsOpen, flash, setFlash } = dialogs;
  const { history, revealRef } = useHistoryAndReveal(canvas, code.snapshot, setFlash);
  const { selection: commandSelection, resetRoutes: onResetRoutes, resetDiagramLayout: onResetDiagramLayout } = useDiagramCommands(canvas, manager);
  const { player, pres } = useFlowPresentation(manager, canvas, activePath, illustration, ws.ready);
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
        onPresentRequest={pres.launcher.show}
        pwa={pwa} grid={grid}
        selection={commandSelection}
        onResetRoutes={onResetRoutes}
        onResetDiagramLayout={onResetDiagramLayout}
      />
      <AppBody
        ws={ws}
        canvas={canvas}
        code={code}
        ui={ui}
        player={player}
        activePath={activePath}
        source={source}
        embedded={embedded}
        onOpenRef={setDocRef} onPresent={pres.start}
        sel={selections(canvas.snap)}
        diverged={diverged}
        illustration={illustration}
        onIllustration={setIllustration}
        dirty={code.snapshot.divergedFromSaved}
        flowSelection={flowSelection}
        onFlowSelection={setFlowSelection}
        revealRef={revealRef}
        linkLabelRef={inspect.linkLabelRef}
        projectIcons={icons.projectIcons}
        onManageIcons={icons.openManager}
        drill={layer.drill}
        doc={layer.doc}
        onSourceOpen={layer.openSource}
        onResetDiagramLayout={onResetDiagramLayout}
        selection={commandSelection}
      />
      <SourceLayer layer={layer} obj={layer.doc?.objects.find((o) => o.id === layer.sourceId) ?? null} />
      <AppOverlays
        hover={hover}
        presenting={pres.presenting}
        player={player}
        launcher={pres.launcher}
        renameTarget={renameBox(canvas.snap, canvas.svgRef.current, renaming)}
        onRenameCommit={(name) => {
          const target = renameBox(canvas.snap, canvas.svgRef.current, renaming);
          if (target !== null) canvas.ctrlRef.current?.updateObject(target.id, { name });
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
        iconsOpen={icons.managerOpen}
        iconDoc={icons.doc}
        onIconsClose={icons.closeManager}
        onIconsCommit={icons.commit}
      />
    </div>
  );
}

export { labelFor };
