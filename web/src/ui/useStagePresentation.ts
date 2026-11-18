// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13: presentation mode + launcher as one shell concern. `usePresentation`
// owns the chrome-free shell state, `usePresentLauncher` owns the flow picker;
// beginning a flow from the picker is the glue that ties them together (start
// playback first, then hand the shell to presentation). The URL anchor is a
// third concern here: the shell publishes authored flow ids as links and starts
// flows named by a link once storage is ready. FlowRunner never sees a URL.
import { useCallback } from 'preact/hooks';
import { usePresentation, type PresentationHandle } from './usePresentation';
import { usePresentLauncher, type PresentLauncherHandle } from './usePresentLauncher';
import { usePresentAnchor } from './usePresentAnchor';
import type { FlowPlayerApi } from './flows/useFlowPlayer';

export interface StagePresentation extends PresentationHandle {
  launcher: PresentLauncherHandle;
}

export interface StagePresentationDeps {
  player: FlowPlayerApi;
  activePath: string | null;
  /** Storage has been restored, so the active file can be resolved. */
  ready: boolean;
  /** File text lookup (workspace adapter); null when the file is absent. */
  textOf(path: string): string | null;
}

export function useStagePresentation(deps: StagePresentationDeps): StagePresentation {
  const pres = usePresentation(deps.player);
  const begin = useCallback(
    (flowKey: string) => {
      if (deps.activePath === null) return;
      deps.player.start(deps.activePath, flowKey);
      pres.start();
      // The present shell widens the canvas, so the beat's framing has to be
      // recomputed after that layout lands (next frame).
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => deps.player.refit());
      }
    },
    [deps.activePath, deps.player, pres],
  );
  const anchor = usePresentAnchor({
    ready: deps.ready,
    activePath: deps.activePath,
    textOf: deps.textOf,
    player: deps.player,
    startFlow: begin,
  });
  const launcher = usePresentLauncher({
    activePath: deps.activePath,
    textOf: deps.textOf,
    start: (flowKey, flowId) => {
      // Publish before playback: a zero-beat flow can end on the same tick.
      anchor.present(flowId);
      begin(flowKey);
    },
  });
  // The play bar's fullscreen button presents the flow already playing; it has
  // no picker, so it publishes the id the runner reported when it started.
  const start = (): void => {
    anchor.present(deps.player.state.flowId);
    pres.start();
  };
  return { ...pres, start, launcher };
}
