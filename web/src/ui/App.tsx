// SPDX-License-Identifier: GPL-3.0-only
// App shell (M3): file tree | tabs | palette | canvas | properties + toolbar.
// The canvas owns its imperative controller (ADR-0001: Preact renders chrome
// around the SVG, never inside it); the WorkspaceManager owns the virtual FS,
// tabs and autosave; chrome re-renders via manager.subscribe(). Lifecycle and
// sync wiring live in useWorkspace.ts; panels below are presentational.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { labelFor, CanvasController, type DiagramLink, type Snapshot } from './CanvasController';
import { FileTree } from './FileTree';
import { Tabs } from './Tabs';
import { CodePane } from './CodePane';
import { FlowPane, type FlowCanvasContext, type FlowSelection, type ViewPoint } from './flows/FlowPane';
import { flowSessionText, parseForEditor, type FlowSession } from './flows/flowSession';
import { useFlowEditing, type FlowEditing } from './flows/useFlowEditing';
import type { FlowPanelProps } from './flows/FlowPanel';
import { invert } from '../engine/render/viewport';
import { PlayBar } from './flows/PlayBar';
import { useStagePresentation } from './useStagePresentation';
import { AppHeader } from './AppHeader';
import { AppDialogs } from './AppDialogs';
import { AppOverlays } from './AppOverlays';
import { BLANK_TEXT, TemplateOverlay } from './EmptyState';
import { useGalleryPrompt, type GalleryPrompt } from './useGalleryPrompt';
import type { RenameTarget } from './InlineRename';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useUiLayout } from './useUiLayout';
import { useAppTheme } from './useAppTheme';
import { useCanvasGrid } from './useCanvasGrid';
import { useHistory } from './useHistory';
import { useShellUi } from './useShellUi';
import { layoutStyle, PANELS, type DockId, type PanelId } from './uiLayout';
import { PanelRail } from './PanelChrome';
import { storageExplanation, type PanelInfo } from './WorkspacePanels';
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
import { DropZone, HostedPanel, StorageActions, StorageLabel } from './WorkspacePanels';
import { useCanvasRevealPort } from './useCanvasReveal';
import type { IllustrationId } from '../engine/anim/illustrations';
import { PaletteSlot, PropsSlot, slot } from './ShellSlots';
import { useShellLifecycle } from './useShellLifecycle';
import type { useDivergedClose } from './useDivergedClose';
import { useFlowStage } from './useFlowStage';
import { useDrawer } from './useDrawer';
import { useShellDialogs } from './useShellDialogs';

import type { FlowPlayerApi } from './flows/useFlowPlayer';
import { flowNotesVisible, stepExplanationVisible } from './flows/flowController';
import type { CodeSyncHandle } from './useCodeSync';
import type { WorkspaceManager } from '../workspace/workspace';
import { useStorageControls, type StorageControls } from './useStorageControls';

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
  storage: StorageControls;
}) {
  return (
    <aside class="sidebar" aria-label={s('Workspace files')}>
      {/* The host header names the panel and holds its controls; the body starts
          with the storage label, then the tree. */}
      <StorageLabel kind={props.manager.storageKind} label={props.manager.storageLabel} />
      <StorageActions
        kind={props.manager.storageKind}
        nativeSupported={props.storage.nativeSupported}
        reconnect={props.storage.reconnect}
        onOpenDirectory={props.storage.openDirectory}
        onReconnect={props.storage.reconnectDirectory}
        onUseBrowserStorage={props.storage.useBrowserStorage}
      />
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
  activePath: string | null;
  source?: DocumentSource;
  /** One editing session for the open file, shared with the Properties panel. */
  session: FlowSession;
  doc: Doc | null;
  onPlay(flowKey: string): void;
  onPlayFrom(flowKey: string, index: number): void;
  dirty: boolean;
  selection: FlowSelection | null;
  onSelection(selection: FlowSelection): void;
  canvasContext: FlowCanvasContext;
  onHighlight(ids: string[] | null): void;
  currentView?: () => ViewPoint | null;
  onEditFraming?(flowKey: string, kind: 'intro' | 'conclusion'): void;
}) {
  return (
    <aside class="sidebar" aria-label={s('Flow step editor')}>
      {/* The host header owns the title and the collapse chevron. */}
      <FlowPane
        textOf={(path) => path === props.source?.label
          ? props.source.text
          : (props.manager.hasFile(path) ? props.manager.text(path) : null)}
        activePath={props.source?.label ?? props.activePath}
        session={props.session}
        doc={props.doc}
        onPlay={props.onPlay}
        onPlayFrom={props.onPlayFrom}
        dirty={props.dirty}
        selection={props.selection}
        onSelection={props.onSelection}
        canvas={props.canvasContext}
        files={props.manager.files().map((file) => file.path)}
        onHighlight={props.onHighlight}
        {...(props.onEditFraming === undefined ? {} : { onEditFraming: props.onEditFraming })}
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
      {/* The stage is the positioning context for canvas overlays (mini-map), so
          they sit above the docked transport rather than under it. */}
      <div class="canvas-stage">
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
      </div>
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
  storage: StorageControls;
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
      storage={props.storage}
    />,
  );
}

/** Independent Flow Steps editor (or its rail). */
function FlowSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  manager: WorkspaceManager;
  activePath: string | null;
  source?: DocumentSource;
  session: FlowSession;
  doc: Doc | null;
  onPlay: (flowKey: string) => void;
  onPlayFrom: (flowKey: string, index: number) => void;
  dirty: boolean;
  selection: FlowSelection | null;
  onSelection: (selection: FlowSelection) => void;
  canvasContext: FlowCanvasContext;
  onHighlight: (ids: string[] | null) => void;
  currentView?: () => ViewPoint | null;
  onEditFraming?(flowKey: string, kind: 'intro' | 'conclusion'): void;
}) {
  return slot(
    props.ui.layout.panels.flows === 'collapsed',
    'flows',
    'flow steps',
    () => props.ui.togglePanel('flows'),
    <FlowStepsPane
      manager={props.manager}
      activePath={props.activePath}
      session={props.session}
      doc={props.doc}
      onPlay={props.onPlay}
      onPlayFrom={props.onPlayFrom}
      dirty={props.dirty}
      selection={props.selection}
      onSelection={props.onSelection}
      canvasContext={props.canvasContext}
      onHighlight={props.onHighlight}
      {...(props.currentView === undefined ? {} : { currentView: props.currentView })}
      {...(props.onEditFraming === undefined ? {} : { onEditFraming: props.onEditFraming })}
    />,
  );
}

function CodeSlot(props: {
  ui: ReturnType<typeof useUiLayout>;
  code: CodeSyncHandle;
  revealRef: { current: ((id: string) => void) | null };
  onCaretObject: (id: string | null) => void;
}) {
  const collapsed = props.ui.layout.panels.code === 'collapsed';
  return (
    <>
      {collapsed && (
        <PanelRail id="code" labelKey="code" onExpand={() => props.ui.togglePanel('code')}>
          <span
            class="rail-chip"
            data-testid="sync-state-rail"
            data-sync-state={props.code.snapshot.state}
          >
            {props.code.snapshot.state.slice(0, 1)}
          </span>
        </PanelRail>
      )}
      <CodePane
        machine={props.code.machine}
        snapshot={props.code.snapshot}
        loaded={props.code.loaded}
        onFormat={props.code.formatNow}
        collapsed={collapsed}
        revealRef={props.revealRef}
        onCaretObject={props.onCaretObject}
      />
    </>
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
async function clearWorkspace(
  manager: WorkspaceManager,
  canvas: ReturnType<typeof useCanvasController>,
  done: () => void,
  onError: (message: string) => void,
): Promise<void> {
  canvas.resync();
  try {
    await manager.clearAll();
    done();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

/** F-25: status-pill inputs (dirty / last save / problem count). */
function statusProps(
  snapshot: CodeSyncHandle['snapshot'],
  ready: boolean,
  manager: WorkspaceManager,
): { dirty: boolean; savedAt: number | null; problems: number } {
  return {
    dirty: snapshot.divergedFromSaved || manager.storageError !== null,
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
    flowSelection: FlowSelection | null;
    onFlowSelection: (selection: FlowSelection) => void;
    manager: WorkspaceManager;
    session: FlowSession;
    doc: Doc | null;
    player: FlowPlayerApi;
    onEditFraming?(flowKey: string, kind: 'intro' | 'conclusion'): void;
  },
): ComponentChildren {
  return (
    <FlowSlot
      ui={p.ui}
      manager={p.manager}
      activePath={p.source?.label ?? p.activePath}
      source={p.source}
      session={p.session}
      doc={p.doc}
      onPlay={(flowKey) => {
        if (p.activePath !== null) p.player.start(p.activePath, flowKey);
      }}
      onPlayFrom={(flowKey, index) => playFrom(p.player, p.activePath, flowKey, index)}
      dirty={p.code.snapshot.divergedFromSaved}
      selection={p.flowSelection}
      onSelection={p.onFlowSelection}
      canvasContext={canvasContext(p.canvas.snap, p.sel.link)}
      onHighlight={(ids) => highlightParticipants(p.canvas, ids)}
      {...(p.onEditFraming === undefined ? {} : { onEditFraming: p.onEditFraming })}
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

/** Everything the flow side of the Properties panel needs from the shell. */
interface FlowPanelWiring {
  session: FlowSession;
  doc: Doc | null;
  selection: FlowSelection | null;
  textOf(path: string): string | null;
  files: string[];
  canvas: FlowCanvasContext;
  view?: () => ViewPoint | null;
  dirty: boolean;
  illustration: IllustrationId | 'auto';
  onIllustration(id: IllustrationId | 'auto'): void;
  onPlay(flowKey: string): void;
  onSelect(selection: FlowSelection | null): void;
  /** A framing field the step list asked Properties to focus. */
  focusField?: { kind: 'intro' | 'conclusion'; nonce: number };
}

/** Wrap the wiring into the panel's props; null while nothing flow-side is open. */
function flowPanelProps(
  p: { activePath: string | null; source?: DocumentSource; ui: ReturnType<typeof useUiLayout> },
  flow: FlowPanelWiring,
): FlowPanelProps | null {
  if (flow.doc === null || flow.selection === null) return null;
  return {
    doc: flow.doc,
    selection: flow.selection,
    session: flow.session,
    activePath: p.source?.label ?? p.activePath,
    textOf: flow.textOf,
    files: flow.files,
    canvas: flow.canvas,
    dirty: flow.dirty,
    illustration: flow.illustration,
    onIllustration: flow.onIllustration,
    onPlay: flow.onPlay,
    onSelect: flow.onSelect,
    sections: p.ui.layout.sections,
    onToggleSection: p.ui.toggleSection,
    ...(flow.view === undefined ? {} : { view: flow.view }),
    ...(flow.focusField === undefined ? {} : { focusField: flow.focusField }),
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
  /** Flow editing surfaces: step or flow properties replace the object fields. */
  flow?: FlowPanelWiring;
}): ComponentChildren {
  const ctrl = p.canvas.ctrlRef.current;
  const hierarchy = hierarchyFor(p, p.sel.obj);
  return (
    <PropsSlot
      flow={p.flow === undefined ? null : flowPanelProps(p, p.flow)}
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

/** Render one dock: the open panels in order plus one rail group holding every
 * collapsed panel of that dock. The rail is the dock's outermost element — before
 * every open panel in a left dock (and in the bottom dock, which reads
 * left-to-right from the same edge), after all of them in a right dock — so a
 * collapsed panel never lands between two open ones. */
function dockedPanels(
  dock: DockId,
  ui: ReturnType<typeof useUiLayout>,
  content: Record<PanelId, ComponentChildren>,
  info: Partial<Record<PanelId, PanelInfo>>,
): ComponentChildren {
  const panels = PANELS.filter((panel) => ui.layout.docks[panel] === dock)
    .sort((a, b) => ui.layout.order[a] - ui.layout.order[b]);
  const collapsed = panels.filter((panel) => ui.layout.panels[panel] === 'collapsed' && dock !== 'float');
  const open = panels.filter((panel) => !collapsed.includes(panel));
  const renderPanel = (panel: PanelId) => (
    <HostedPanel key={panel} id={panel} ui={ui} {...(info[panel] === undefined ? {} : { info: info[panel] })}>
      {content[panel]}
    </HostedPanel>
  );
  const rail = collapsed.length === 0 ? null : (
    <div
      key={`collapsed-rail-${dock}`}
      class="panel-rail-group"
      data-testid={`collapsed-rail-${dock}`}
      data-dock={dock}
    >
      {collapsed.map(renderPanel)}
    </div>
  );
  const hosts = open.map(renderPanel);
  return dock === 'right' ? [...hosts, rail] : [rail, ...hosts];
}

/** First free `diagram.pcd`, `diagram-2.pcd`, … in the workspace root. */
function freeDiagramPath(manager: WorkspaceManager): string {
  if (!manager.hasFile('diagram.pcd')) return 'diagram.pcd';
  for (let n = 2; ; n += 1) {
    const path = `diagram-${n}.pcd`;
    if (!manager.hasFile(path)) return path;
  }
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
/** AppBody props plus the flow session it creates for its two editing surfaces. */
type BodyProps = Parameters<typeof AppBody>[0] & { flowEdit: FlowEditing };

function bodyPanels(
  p: BodyProps,
  ctrl: CanvasController | null,
): Record<PanelId, ComponentChildren> {
  const { ws, canvas, code, ui, player, activePath, source, embedded } = p;
  // A virtual Default edit selects its custom copy before the async file writer
  // reparses it. Read that pending source for both flow surfaces so the new
  // selection never makes the properties editor unmount between keystrokes.
  const pendingFlowText = p.flowEdit.session.read();
  const flowDoc = pendingFlowText === source.text ? p.doc : (parseForEditor(pendingFlowText) ?? p.doc);
  return {
    sidebar: (
      <SidebarSlot
        ui={ui}
        manager={ws.manager}
        version={ws.version}
        embedded={embedded}
        activeRef={source.ref}
        onOpenRef={p.onOpenRef}
        storage={p.storage}
      />
    ),
    flows: flowsSlot({
      ui,
      canvas,
      code,
      activePath,
      source,
      sel: p.sel,
      flowSelection: p.flowSelection,
      onFlowSelection: p.flowEdit.selectFlow,
      manager: ws.manager,
      session: p.flowEdit.session,
      doc: flowDoc,
      player,
      onEditFraming: p.flowEdit.focusFraming,
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
      flow: {
        session: p.flowEdit.session,
        doc: flowDoc,
        selection: p.flowSelection,
        textOf: (path) =>
          path === p.source?.label
            ? p.source.text
            : (ws.manager.hasFile(path) ? ws.manager.text(path) : null),
        files: ws.manager.files().map((file) => file.path),
        canvas: canvasContext(canvas.snap, p.sel.link),
        dirty: p.dirty,
        illustration: p.illustration,
        onIllustration: p.onIllustration,
        onPlay: (flowKey) => {
          if (activePath !== null) player.start(activePath, flowKey);
        },
        onSelect: p.flowEdit.selectFlow,
        ...(p.flowEdit.framingFocus === undefined ? {} : { focusField: p.flowEdit.framingFocus }),
        ...(currentViewOf(canvas) === undefined ? {} : { view: currentViewOf(canvas)! }),
      },
    }),
  };
}

/** Inputs of the flow-editing hook, gathered from the shell handles. */
function flowEditingArgs(
  ws: ReturnType<typeof useWorkspace>,
  code: CodeSyncHandle,
  source: DocumentSource,
  canvas: ReturnType<typeof useCanvasController>,
  setSelection: (next: FlowSelection | null) => void,
): Parameters<typeof useFlowEditing>[0] {
  return {
    // Reconcile with the buffer during edit/undo, but never replace a clean,
    // non-empty file with an older canvas projection still awaiting render.
    text: flowSessionText(source.text, code.snapshot),
    version: ws.version,
    onChangeText: (next) => code.machine.textChanged(next),
    setSelection,
    clearCanvasSelection: () => canvas.ctrlRef.current?.setSelection([]),
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
  onFlowSelection: (selection: FlowSelection | null) => void;
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
  /** Files-panel storage controls (native folder, reconnect, browser switch). */
  storage: StorageControls;
}) {
  const { ws, canvas, code, ui, player, activePath, source } = p;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ctrl = canvas.ctrlRef.current;
  const { drawer, dismiss } = useDrawer(ui);
  // One flow-editing session, shared by the step list and the Properties panel.
  const flowEdit = useFlowEditing(flowEditingArgs(ws, code, source, canvas, p.onFlowSelection));
  // Touching the diagram ends the flow edit: the seam is the canvas press
  // (`onUserPointer` above), not a state comparison — editing a step rewrites
  // the file, and the reload may re-select its connector on its own, which must
  // not close the step that was just edited.
  // Choosing a flow or a step opens the panel its properties live in — a rail
  // that stays collapsed would make the click look like it did nothing.
  const flowChoice = p.flowSelection === null ? '' : `${p.flowSelection.flow}:${p.flowSelection.step.join('.')}`;
  useEffect(() => {
    if (flowChoice !== '' && ui.layout.panels.props === 'collapsed') ui.openPanel('props');
  }, [flowChoice]);
  const gallery = useGalleryPrompt();
  const content = bodyPanels({ ...p, flowEdit }, ctrl);
  // One explanation per panel header: the storage wording lives beside the Files
  // title instead of occupying the top of the panel as a standing paragraph.
  const panelInfo: Partial<Record<PanelId, PanelInfo>> = {
    sidebar: { text: storageExplanation(ws.manager.storageKind) },
  };
  const docked = (dock: DockId) => dockedPanels(dock, ui, content, panelInfo);
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
        gallery={gallery}
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
  gallery: GalleryPrompt;
  onCanvasContextMenu: (e: MouseEvent) => void;
}) {
  const { canvas, player } = props;
  const parent = props.drill.parent;
  /**
   * A starting point needs a file to live in. With a tab open the buffer is the
   * target; with none, the click used to fill a buffer that no file owned, so the
   * text was dropped and the stale buffer then reported a divergence against the
   * file that had just been closed. Creating the file first gives the gallery a
   * real target — it opens, the canvas loads its diagram, and the answer is
   * recorded for the new path so the gallery does not ask again.
   */
  const startFrom = (text: string): void => {
    props.gallery.answer(props.activePath);
    if (props.activePath !== null) {
      props.code.machine.textChanged(text);
      return;
    }
    const path = freeDiagramPath(props.manager);
    props.manager.createFileAt(path, text);
    props.gallery.answer(path);
  };
  return (
    <main class="canvas-col" data-parent={parent === undefined ? undefined : parent.label}>
      <TemplateOverlay
        show={props.gallery.visible(
          props.activePath,
          props.canvas.snap?.objects.length ?? 0,
          props.code.snapshot.codeText,
        )}
        onInsert={(t) => startFrom(t.text)}
        onBlank={() => startFrom(BLANK_TEXT)}
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
  usePresentationCanvasChrome(canvas, pres.presenting);
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

function usePresentationCanvasChrome(
  canvas: ReturnType<typeof useCanvasController>,
  presenting: boolean,
): void {
  useEffect(() => {
    // Selection remains editing state, but its handles and outlines must not
    // follow the presentation camera. FlowAnimator owns a separate SVG layer.
    canvas.ctrlRef.current?.setEditingChromeVisible(!presenting);
  }, [canvas.ctrlRef, presenting]);
}

/** Reload both views after restoring content under the same document key. */
function resyncDocuments(canvas: { resync(): void }, code: { resync(): void }): void {
  canvas.resync();
  code.resync();
}

/**
 * Native open/reconnect/use-browser lives behind this one seam: components hold
 * no capability chain, and a picked folder is remembered only after the switch.
 */
function useShellStorage(
  ws: ReturnType<typeof useWorkspace>,
  manager: WorkspaceManager,
  canvas: ReturnType<typeof useCanvasController>,
  code: CodeSyncHandle,
  onError: (message: string) => void,
): StorageControls {
  return useStorageControls({
    manager,
    selection: ws.selection,
    reconnect: ws.reconnect,
    setReconnect: ws.setReconnect,
    onSwitched: () => resyncDocuments(canvas, code),
    onError,
  });
}

export function App() {
  const ws = useWorkspace(); const activePath = ws.ready ? ws.manager.activePath : null;
  const { renaming, setRenaming, hover, setHover, illustration, setIllustration,
    flowSelection, setFlowSelection, historyOpen, setHistoryOpen } = useShellUi();
  const { grid, ui } = useShellLayout(ws.manager, ws.ready, ws.version); const { manager } = ws;
  const { source, embedded, setRef: setDocRef } = useActiveDocument(manager, activePath, ws.version);
  const { canvas, inspect, code, icons } = useDocumentPipeline({
    ws, ui, grid, activePath, source,
    onRename: setRenaming, // inline rename request from the canvas
    onGhostOpen: (path) => ws.manager.openFile(path), // F-20
    onHover: setHover, // hover card content
    onUserPointer: () => setFlowSelection(null), // a press on the diagram leaves the flow edit
  });
  const layer = useDrillLayer({
    activePath, manager, version: ws.version, revision: code.snapshot,
    ctrlRef: canvas.ctrlRef, commitDoc: code.commitDoc,
    openFile: (path) => manager.openFile(path),
    source, setRef: setDocRef,
  });
  const { dialogs, theme: appTheme } = useDialogsAndTheme(manager, ws.ready, ws.version);
  const { clearOpen, setClearOpen, snapsOpen, setSnapsOpen, versionsOpen, setVersionsOpen, flash, setFlash } = dialogs;
  const { history, revealRef } = useHistoryAndReveal(canvas, code.snapshot, setFlash);
  const storage = useShellStorage(ws, manager, canvas, code, setFlash);
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
      class={`app-shell${pres.presenting ? ' presenting' : ''}${pres.presenting && flowNotesVisible(player.state) ? ' has-flow-notes' : ''}${pres.presenting && stepExplanationVisible(player.state) ? ' has-step-explanation' : ''}`}
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
        onOpenDirectory={storage.nativeSupported ? storage.openDirectory : undefined}
        onSnapshotsRequest={() => setSnapsOpen(true)} onVersionsRequest={() => setVersionsOpen(true)}
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
        activePath={activePath} source={source}
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
        storage={storage}
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
        ctrlRef={canvas.ctrlRef} resyncDocuments={() => resyncDocuments(canvas, code)}
        diverged={diverged}
        clearOpen={clearOpen}
        clearData={() => void clearWorkspace(manager, canvas, () => setClearOpen(false), setFlash)}
        onClearCancel={() => setClearOpen(false)}
        flash={flash}
        onFlashDismiss={() => setFlash(null)}
        {...{ historyOpen, history, onHistoryClose: () => setHistoryOpen(false) }}
        snapsOpen={snapsOpen} onSnapsClose={() => setSnapsOpen(false)}
        versionsOpen={versionsOpen} onVersionsClose={() => setVersionsOpen(false)}
        iconsOpen={icons.managerOpen}
        iconDoc={icons.doc}
        onIconsClose={icons.closeManager}
        onIconsCommit={icons.commit}
      />
    </div>
  );
}

export { labelFor };
