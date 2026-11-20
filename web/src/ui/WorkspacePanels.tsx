// SPDX-License-Identifier: GPL-3.0-only
// Shared dock/float chrome and keyboard-accessible panel commands (UX-02).

import { useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { PANELS, type DockId, type FloatingBounds, type PanelId } from './uiLayout';
import type { UiLayoutHandle } from './useUiLayout';
import { Splitter } from './PanelChrome';
import { Menu } from './Menu';
import { s } from './strings';
import type { StorageKind } from '../workspace/store/port';

export function panelLabel(panel: PanelId): string {
  if (panel === 'sidebar') return s('Files');
  if (panel === 'flows') return s('Flow Steps');
  if (panel === 'palette') return s('Shapes');
  if (panel === 'code') return s('Code');
  return s('Properties');
}

interface DropZoneProps {
  dock: DockId;
  onMove: (panel: PanelId, dock: DockId) => void;
  children: ComponentChildren;
}

export function DropZone({ dock, onMove, children }: DropZoneProps) {
  const [over, setOver] = useState(false);
  return (
    <div
      class={`dock-zone dock-${dock}${over ? ' drag-over' : ''}`}
      data-testid={`dock-${dock}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const panel = event.dataTransfer?.getData('application/x-panelcraft-panel') as PanelId;
        if (PANELS.includes(panel)) onMove(panel, dock);
      }}
    >
      {children}
    </div>
  );
}

interface PanelHostProps {
  id: PanelId;
  dock: DockId;
  bounds?: FloatingBounds;
  height?: number;
  children: ComponentChildren;
  onMove: (panel: PanelId, dock: DockId) => void;
  onClose: (panel: PanelId) => void;
  onBounds: (panel: PanelId, bounds: FloatingBounds) => void;
}

/** One wording per backend: the label must name where the files really live. */
export function storageText(kind: StorageKind, label: string): string {
  if (kind === 'directory') return s('Local folder: {name}', { name: label });
  if (kind === 'server') return `${s('Server storage:')} ${label}`;
  if (kind === 'opfs') return s('Browser files (origin-private)');
  if (kind === 'local') return s('Browser storage (Web Storage)');
  if (kind === 'memory') return s('In-memory workspace (not saved)');
  return s('Browser storage (IndexedDB)');
}

/** Identify the active backend; every kind has distinct, truthful wording. */
export function StorageLabel(props: { kind: StorageKind; label: string }) {
  return (
    <p class="storage-label" data-testid="workspace-storage" data-storage-kind={props.kind}>
      {storageText(props.kind, props.label)}
    </p>
  );
}

export interface StorageActionsProps {
  kind: StorageKind;
  /** Picker capability: hide native selection where the browser lacks it. */
  nativeSupported: boolean;
  /** Label of a remembered folder whose permission must be granted again. */
  reconnect: string | null;
  onOpenDirectory: () => void;
  onReconnect: () => void;
  onUseBrowserStorage: () => void;
}

/**
 * Files-panel storage controls. Native selection is a plain, always-visible
 * button (no first-run modal), and leaving a device folder is explicit: the
 * workspace is never copied between backends behind the user's back.
 */
export function StorageActions(props: StorageActionsProps) {
  const native = props.kind === 'directory';
  return (
    <div class="storage-actions" data-testid="storage-actions">
      {props.reconnect === null ? null : (
        <p class="storage-hint" data-testid="storage-reconnect-hint">
          {s('This folder needs permission again. Reconnect to grant read and write access.')}
        </p>
      )}
      {props.nativeSupported ? (
        <button
          type="button"
          class="storage-action"
          data-testid="storage-open-directory"
          onClick={props.onOpenDirectory}
        >
          {s('Open directory…')}
        </button>
      ) : null}
      {props.reconnect === null ? null : (
        <button
          type="button"
          class="storage-action"
          data-testid="storage-reconnect"
          onClick={props.onReconnect}
        >
          {s('Reconnect local folder…')}
        </button>
      )}
      {native ? (
        <button
          type="button"
          class="storage-action"
          data-testid="storage-use-browser"
          onClick={props.onUseBrowserStorage}
        >
          {s('Use browser storage')}
        </button>
      ) : null}
      <p class="storage-hint" data-testid="storage-hint">
        {native
          ? s("Switch to browser files and stop editing this folder. Its files stay on disk.")
          : s('Browser files live only in this browser. They are not visible in your file manager.')}
      </p>
    </div>
  );
}

/** Shared title, drag source, floating geometry and keyboard dock alternative. */
export function PanelHost(props: PanelHostProps) {
  const start = useRef<{ x: number; y: number; bounds: FloatingBounds } | null>(null);
  const style = props.dock === 'float' && props.bounds
    ? {
        left: `${props.bounds.x}px`,
        top: `${props.bounds.y}px`,
        width: `${props.bounds.width}px`,
        height: `${props.bounds.height}px`,
      }
    : props.dock === 'bottom'
      ? { height: `${props.height ?? 240}px` }
      : undefined;
  return (
    <section
      class={`panel-host panel-${props.dock}`}
      data-panel={props.id}
      data-dock={props.dock}
      style={style}
      onPointerUp={(event) => {
        start.current = null;
        if (props.dock !== 'float') return;
        const element = event.currentTarget as HTMLElement;
        const bounds = props.bounds;
        if (!bounds) return;
        props.onBounds(props.id, {
          ...bounds,
          width: element.offsetWidth,
          height: element.offsetHeight,
        });
      }}
    >
      <div class="panel-host-header">
        <button
          type="button"
          class="panel-title"
          data-testid={`panel-title-${props.id}`}
          aria-label={s('{label} panel. Drag to move; panel actions provide keyboard docking.', {
            label: panelLabel(props.id),
          })}
          draggable={props.dock !== 'float'}
          onDragStart={(event) => {
            event.dataTransfer?.setData('application/x-panelcraft-panel', props.id);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          }}
          onPointerDown={(event) => {
            if (props.dock !== 'float' || !props.bounds) return;
            start.current = { x: event.clientX, y: event.clientY, bounds: props.bounds };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const origin = start.current;
            if (!origin) return;
            props.onBounds(props.id, {
              ...origin.bounds,
              x: origin.bounds.x + event.clientX - origin.x,
              y: origin.bounds.y + event.clientY - origin.y,
            });
          }}
        >
          {panelLabel(props.id)}
        </button>
        <Menu
          id={`panel-actions-${props.id}`}
          class="panel-actions"
          label={s('{label} panel actions', { label: panelLabel(props.id) })}
          testId={`panel-menu-${props.id}`}
          trigger={s('⋮')}
          items={[
            ...(['left', 'right', 'bottom', 'float'] as const).map((dock) => ({
              kind: 'item' as const,
              id: `dock-${dock}`,
              label: s('Dock {dock}', { dock }),
              testId: `dock-${props.id}-${dock}`,
              disabled: props.dock === dock,
              onSelect: () => props.onMove(props.id, dock),
            })),
            { kind: 'separator' as const, id: 'panel-actions-sep' },
            {
              kind: 'item' as const,
              id: 'close',
              label: s('Close {label} panel', { label: panelLabel(props.id) }),
              testId: `close-${props.id}`,
              onSelect: () => props.onClose(props.id),
            },
          ]}
        />
      </div>
      <div class="panel-host-content">{props.children}</div>
    </section>
  );
}

export function HostedPanel(props: { id: PanelId; ui: UiLayoutHandle; children: ComponentChildren }) {
  const { id, ui } = props;
  const mode = ui.layout.panels[id];
  const dock = ui.layout.docks[id];
  if (mode === 'closed') return null;
  if (mode === 'collapsed' && dock !== 'float') return props.children;
  const host = (
    <PanelHost
      id={id}
      dock={dock}
      bounds={ui.layout.floating[id]}
      height={ui.layout.heights[id]}
      onMove={ui.movePanel}
      onClose={ui.closePanel}
      onBounds={ui.setFloatingBounds}
    >
      {props.children}
    </PanelHost>
  );
  if (dock === 'float') return host;
  const direction = dock === 'left' ? 1 : -1;
  const splitter = (
    <Splitter
      id={id}
      label={s('Resize {label} panel', { label: panelLabel(id) })}
      orientation={dock === 'bottom' ? 'horizontal' : 'vertical'}
      onResize={(dx, dy) => {
        if (dock === 'bottom') ui.setPanelHeight(id, ui.layout.heights[id] - dy);
        else ui.setPanelWidth(id, ui.layout.widths[id] + dx * direction);
      }}
      onEnd={ui.flushLayout}
    />
  );
  if (dock === 'bottom') {
    return <div class="panel-bottom-wrap">{host}{splitter}</div>;
  }
  return <>{host}{splitter}</>;
}
