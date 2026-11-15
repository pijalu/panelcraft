// SPDX-License-Identifier: GPL-3.0-only
// Overlay layer above the shell (F-25/F-16/F-15): hover card, template gallery,
// presentation shell and the inline rename input. Extracted so `App` stays
// inside the function-length gate.
import type { ComponentChildren } from 'preact';
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import type { RenameTarget } from './InlineRename';
import { HoverCard } from './HoverCard';
import { InlineRename } from './InlineRename';
import { PresentLayer } from './PresentDock';
import type { HoverInfo } from './hoverInfo';
import { PresentLauncher } from './flows/PresentLauncher';
import type { PresentLauncherHandle } from './usePresentLauncher';

export interface AppOverlaysProps {
  hover: HoverInfo | null;
  presenting: boolean;
  player: FlowPlayerApi;
  /** UX08-WP13: flow picker shown above the shell while it is open. */
  launcher: PresentLauncherHandle;
  renameTarget: RenameTarget | null;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
}

export function AppOverlays(props: AppOverlaysProps): ComponentChildren {
  return (
    <>
      <HoverCard info={props.hover} />
      {props.presenting && <PresentLayer player={props.player} />}
      {props.launcher.open && (
        <PresentLauncher
          entries={props.launcher.entries}
          onPresent={(key) => props.launcher.present(key)}
          onClose={props.launcher.close}
        />
      )}
      {props.renameTarget !== null && (
        <InlineRename
          target={props.renameTarget}
          onCommit={props.onRenameCommit}
          onCancel={props.onRenameCancel}
        />
      )}
    </>
  );
}
