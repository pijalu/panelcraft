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

export interface AppOverlaysProps {
  hover: HoverInfo | null;
  presenting: boolean;
  player: FlowPlayerApi;
  renameTarget: RenameTarget | null;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
}

export function AppOverlays(props: AppOverlaysProps): ComponentChildren {
  return (
    <>
      <HoverCard info={props.hover} />
      {props.presenting && <PresentLayer player={props.player} />}
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
