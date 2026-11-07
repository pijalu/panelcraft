// SPDX-License-Identifier: GPL-3.0-only
// App shell (M3): file tree | tabs | palette | canvas | properties + toolbar.
// The canvas owns its imperative controller (ADR-0001: Preact renders chrome
// around the SVG, never inside it); the WorkspaceManager owns the virtual FS,
// tabs and autosave; chrome re-renders via manager.subscribe(). Lifecycle and
// sync wiring live in useWorkspace.ts; panels below are presentational.
import { useState } from 'preact/hooks';
import { PALETTE_ORDER, labelFor, type Snapshot } from './CanvasController';
import { PropertiesPanel } from './PropertiesPanel';
import { Palette } from './Palette';
import { FileTree } from './FileTree';
import { Tabs } from './Tabs';
import { Banners } from './Banners';
import { ClearDataDialog } from './ClearDataDialog';
import { DivergedDialog } from './DivergedDialog';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { CodePane } from './CodePane';
import { useCanvasController, useWorkspace } from './useWorkspace';
import { useCodeSync } from './useCodeSync';
import { useDivergedClose } from './useDivergedClose';
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

function errorToShow(manager: WorkspaceManager, dismissed: string | null, ready: boolean): string | null {
  if (!ready || manager.openError === null || manager.openError === dismissed) return null;
  return manager.openError;
}

export function App() {
  const ws = useWorkspace();
  const canvas = useCanvasController(ws.manager, ws.ready, ws.version);
  const activePath = ws.ready ? ws.manager.activePath : null;
  const code = useCodeSync({
    manager: ws.manager,
    ready: ws.ready,
    activePath,
    version: ws.version,
    ctrlRef: canvas.ctrlRef,
    snap: canvas.snap,
  });
  const [clearOpen, setClearOpen] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { manager } = ws;
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
      <header class="app-header">
        <span class="app-title">PanelCraft</span>
        <span class="muted">M3 workspace — autosaved in your browser</span>
        <WorkspaceToolbar
          manager={manager}
          activePath={ws.ready ? manager.activePath : null}
          ready={ws.ready}
          svgRef={canvas.svgRef}
          onFlash={setFlash}
          onToggleEphemeral={(on) => {
            ws.clearReminder();
            void manager.setEphemeral(on);
          }}
          onClearRequest={() => setClearOpen(true)}
        />
      </header>
      <Banners
        openError={errorToShow(manager, dismissedError, ws.ready)}
        quotaDegraded={ws.ready && manager.quotaDegraded}
        ephemeral={ws.ready && manager.ephemeral}
        reminder={ws.reminder}
        onDismissError={() => setDismissedError(manager.openError)}
        onDismissReminder={ws.clearReminder}
      />
      <div class="app-body">
        <aside class="sidebar">
          <FileTree manager={manager} version={ws.version} onOpen={(p) => manager.openFile(p)} />
        </aside>
        <Palette
          kinds={PALETTE_ORDER}
          onPlace={(k) => ctrl?.addObject(k)}
          onDragDrop={canvas.onPaletteDrop}
        />
        <main class="canvas-col">
          <Tabs
            tabs={manager.tabs.tabs}
            active={manager.tabs.active}
            onSelect={(i) => {
              const t = manager.tabs.tabs[i];
              if (t) manager.openFile(t.path);
            }}
            onClose={diverged.requestCloseTab}
            onReorder={(from, to) => manager.moveTabAt(from, to)}
          />
          <div class="canvas-split">
            <main class="canvas-wrap">
              <svg ref={canvas.svgRef} class="pc-canvas" data-testid="canvas" width="100%" height="100%" />
            </main>
            <CodePane machine={code.machine} snapshot={code.snapshot} onFormat={code.formatNow} />
          </div>
        </main>
        <PropertiesPanel
          obj={sel.obj}
          link={sel.link}
          nameFieldRef={canvas.nameFieldRef}
          onChangeObject={(id, patch) => ctrl?.updateObject(id, patch)}
          onChangeLink={(id, patch) => ctrl?.updateLink(id, patch)}
        />
      </div>
      {clearOpen && <ClearDataDialog onConfirm={clearData} onCancel={() => setClearOpen(false)} />}
      {diverged.prompt !== null && (
        <DivergedDialog
          path={diverged.prompt.path}
          parseError={diverged.prompt.parseError}
          onApply={diverged.prompt.onApply}
          onDiscard={diverged.prompt.onDiscard}
          onCancel={diverged.prompt.onCancel}
        />
      )}
      {flash !== null && (
        <div class="banner banner-error" data-testid="banner-flash" role="alert">
          <span>{flash}</span>
          <button type="button" onClick={() => setFlash(null)}>dismiss</button>
        </div>
      )}
    </div>
  );
}

export { labelFor };
