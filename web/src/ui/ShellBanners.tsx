// SPDX-License-Identifier: GPL-3.0-only
// Shell status banners (F-20/F-23): import problems and the "diagram out of
// date" notice that appears while the code buffer has parse errors.
import type { ComponentChildren } from 'preact';
import type { CanvasController } from './CanvasController';
import type { SyncSnapshot } from './codeview/sync';
import type { WorkspaceManager } from '../workspace/workspace';
import { useCanvasDiagnostics } from './useCanvasDiagnostics';
import { useImportGhosts } from './useImportGhosts';
import { ImportBanner } from './ShellSlots';
import { s } from './strings';

export interface ShellBannersProps {
  snapshot: SyncSnapshot;
  ctrlRef: { current: CanvasController | null };
  manager: WorkspaceManager;
  ready: boolean;
  activePath: string | null;
  version: number;
}

export function ShellBanners(props: ShellBannersProps): ComponentChildren {
  const diag = useCanvasDiagnostics(
    props.snapshot.codeText,
    props.snapshot.diagnostics,
    props.snapshot.state,
    props.ctrlRef,
    props.version,
  );
  const importErrors = useImportGhosts(
    props.manager,
    props.ready,
    props.activePath,
    props.version,
    props.ctrlRef,
  );
  return (
    <>
      <ImportBanner errors={importErrors} />
      <span
        class="sr-only"
        data-testid="diag-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {diag.count}
      </span>
      {diag.stale && (
        <p class="canvas-stale" data-testid="canvas-stale" role="status">
          {s('Diagram out of date — fix')} {diag.count} {s('problem')}{diag.count === 1 ? '' : s('s')} {s('in the code view.')}
        </p>
      )}
    </>
  );
}
