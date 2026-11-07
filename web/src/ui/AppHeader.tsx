// SPDX-License-Identifier: GPL-3.0-only
// Header row (extracted to keep App under the function-length gate): title,
// toolbar, workspace banners. Error dismissal is local to this row.
import { useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { Banners } from './Banners';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { useWorkspace } from './useWorkspace';
import type { WorkspaceManager } from '../workspace/workspace';

function errorToShow(manager: WorkspaceManager, dismissed: string | null, ready: boolean): string | null {
  if (!ready || manager.openError === null || manager.openError === dismissed) return null;
  return manager.openError;
}

export function AppHeader(props: {
  ws: ReturnType<typeof useWorkspace>;
  svgRef: RefObject<SVGSVGElement | null>;
  onFlash(msg: string): void;
  onClearRequest(): void;
  onSnapshotsRequest(): void;
}) {
  const { ws } = props;
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  return (
    <>
      <header class="app-header">
        <span class="app-title">PanelCraft</span>
        <span class="muted">M3 workspace — autosaved in your browser</span>
        <WorkspaceToolbar
          manager={ws.manager}
          activePath={ws.ready ? ws.manager.activePath : null}
          ready={ws.ready}
          svgRef={props.svgRef}
          onFlash={props.onFlash}
          onToggleEphemeral={(on) => {
            ws.clearReminder();
            void ws.manager.setEphemeral(on);
          }}
          onClearRequest={props.onClearRequest}
          onSnapshotsRequest={props.onSnapshotsRequest}
        />
      </header>
      <Banners
        openError={errorToShow(ws.manager, dismissedError, ws.ready)}
        quotaDegraded={ws.ready && ws.manager.quotaDegraded}
        ephemeral={ws.ready && ws.manager.ephemeral}
        reminder={ws.reminder}
        onDismissError={() => setDismissedError(ws.manager.openError)}
        onDismissReminder={ws.clearReminder}
      />
    </>
  );
}
