// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13: presentation mode + launcher as one shell concern. `usePresentation`
// owns the chrome-free shell state, `usePresentLauncher` owns the flow picker;
// beginning a flow from the picker is the glue that ties them together (start
// playback first, then hand the shell to presentation).
import { usePresentation, type PresentationHandle } from './usePresentation';
import { usePresentLauncher, type PresentLauncherHandle } from './usePresentLauncher';
import type { FlowPlayerApi } from './flows/useFlowPlayer';

export interface StagePresentation extends PresentationHandle {
  launcher: PresentLauncherHandle;
}

export interface StagePresentationDeps {
  player: FlowPlayerApi;
  activePath: string | null;
  /** File text lookup (workspace adapter); null when the file is absent. */
  textOf(path: string): string | null;
}

export function useStagePresentation(deps: StagePresentationDeps): StagePresentation {
  const pres = usePresentation(deps.player);
  const launcher = usePresentLauncher({
    activePath: deps.activePath,
    textOf: deps.textOf,
    start: (flowKey) => {
      if (deps.activePath === null) return;
      deps.player.start(deps.activePath, flowKey);
      pres.start();
      // The present shell widens the canvas, so the beat's framing has to be
      // recomputed after that layout lands (next frame).
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => deps.player.refit());
      }
    },
  });
  return { ...pres, launcher };
}
