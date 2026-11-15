// SPDX-License-Identifier: GPL-3.0-only
// Header row (extracted to keep App under the function-length gate): title,
// toolbar, workspace banners. Error dismissal is local to this row.
import { useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { Banners } from './Banners';
import { StatusPill } from './StatusPill';
import { AppMenu } from './AppMenu';
import { useWorkspace } from './useWorkspace';
import type { WorkspaceManager } from '../workspace/workspace';
import type { UiLayoutHandle } from './useUiLayout';
import { s } from './strings';
import type { AppThemeHandle } from './useAppTheme';
import type { PwaHandle } from './usePwa';

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
  /** F-24: open the unified history affordance. */
  onHistoryRequest(): void;
  /** F-16: enter presentation mode from the application menu. */
  onPresentRequest(): void;
  ui: UiLayoutHandle;
  theme: AppThemeHandle;
  /** F-25: system-status pill. */
  dirty: boolean;
  savedAt: number | null;
  problems: number;
  /** UX08-WP04: install + update lifecycle owned by the shell. */
  pwa: PwaHandle;
}) {
  const { ws } = props;
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  return (
    <>
      <header class="app-header">
        <span class="app-title">{s('PanelCraft')}</span>
        <StatusPill dirty={props.dirty} savedAt={props.savedAt} problems={props.problems} />
        <AppMenu
          manager={ws.manager}
          ready={ws.ready}
          activePath={ws.ready ? ws.manager.activePath : null}
          svgRef={props.svgRef}
          ui={props.ui}
          theme={props.theme}
          privateMode={ws.manager.ephemeral}
          onFlash={props.onFlash}
          onHistoryRequest={props.onHistoryRequest}
          onPresent={props.onPresentRequest}
          onSnapshotsRequest={props.onSnapshotsRequest}
          onClearRequest={props.onClearRequest}
          onToggleEphemeral={(on) => {
            ws.clearReminder();
            void ws.manager.setEphemeral(on);
          }}
          install={{
            availability: props.pwa.install,
            promptInstall: () => void props.pwa.installPrompt(),
            guide: () => void props.pwa.installPrompt(),
          }}
          update={{
            state: props.pwa.update,
            unapplied: props.pwa.unapplied,
            restart: () => void props.pwa.restart(),
          }}
        />
      </header>
      <Banners
        openError={errorToShow(ws.manager, dismissedError, ws.ready)}
        quotaDegraded={ws.ready && ws.manager.quotaDegraded}
        ephemeral={ws.ready && ws.manager.ephemeral}
        reminder={ws.reminder}
        onDismissError={() => setDismissedError(ws.manager.openError)}
        onDismissReminder={ws.clearReminder}
        update={
          props.pwa.updateVisible
            ? {
                unapplied: props.pwa.unapplied,
                // Restart is explicit consent: with unapplied code the banner asks
                // first, so this confirmed click forces the swap.
                onRestart: () => void props.pwa.restart({ force: props.pwa.unapplied !== null }),
                onLater: () => props.pwa.later(),
              }
            : null
        }
      />
    </>
  );
}
