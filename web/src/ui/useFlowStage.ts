// SPDX-License-Identifier: GPL-3.0-only
// M5-WP8 App wiring for flow playback: builds the real FlowAnimator +
// CameraController once the SVG world group exists, bridges canvas rects
// (screen → world) into the player, and adapts the workspace manager to the
// narrow FlowPlayerDeps ports. Camera commits go through ctrl.applyCamera
// (no snapshot emit — playback must not feed the canvas→machine bridge).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { FlowAnimator } from '../engine/anim/engine';
import { CameraController } from '../engine/anim/camera';
import { waapiPlayer, systemClock } from '../engine/anim/ports';
import type { Rect, Size } from '../engine/render/viewport';
import { useFlowPlayer, type FlowPlayerApi } from './flows/useFlowPlayer';
import type { WorkspaceManager } from '../workspace/workspace';
import type { CanvasHandle } from './useWorkspace';
import type { IllustrationId } from '../engine/anim/illustrations';

export interface FlowStageDeps {
  manager: WorkspaceManager;
  canvas: CanvasHandle;
  activePath: string | null;
  /** F-17: illustration style for playback ('auto' = per beat kind). */
  illustration?: IllustrationId | 'auto';
}

/** DOM rect of a scene element in SCREEN coordinates (null when invisible). */
function screenRectOf(svg: SVGSVGElement, id: string): Rect | null {
  const el = svg.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (el === null || !(el instanceof SVGGraphicsElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null; // jsdom / hidden scene
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

export function useFlowStage(deps: FlowStageDeps): FlowPlayerApi {
  const { manager, canvas } = deps;
  const [stage, setStage] = useState<{
    animator: FlowAnimator;
    camera: CameraController;
  } | null>(null);

  // One-time build of the real animator/camera once the world group mounts.
  useEffect(() => {
    const svg = canvas.svgRef.current;
    if (stage !== null || svg === null) return;
    const world = svg.querySelector('.pc-world');
    if (world === null) return;
    const camera = new CameraController({
      el: world,
      apply: (t) => canvas.ctrlRef.current?.applyCamera(t),
      view: (): Size => ({ w: svg.clientWidth, h: svg.clientHeight }),
      player: waapiPlayer,
      clock: systemClock,
      // F-16: reduced-motion users get instant camera moves and no beat animation
      reducedMotion:
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
          : false,
    });
    setStage({ animator: new FlowAnimator(svg, { player: waapiPlayer }), camera });
  }, [stage, canvas.svgRef, canvas.ctrlRef]);

  // F-17: apply the flow's illustration choice to the animator
  useEffect(() => {
    if (stage === null) return;
    stage.animator.setIllustration(
      deps.illustration === undefined || deps.illustration === 'auto' ? null : deps.illustration,
    );
  }, [stage, deps.illustration]);

  const noopBeat = useMemo(() => ({ play: () => {}, stop: () => {} }), []);
  const noopCam = useMemo(() => ({ focus: () => {}, save: () => {}, restoreSaved: () => {} }), []);

  const textOf = useMemo(
    () => (path: string): string | null => {
      try {
        return manager.text(path);
      } catch {
        return null;
      }
    },
    [manager],
  );

  const player = useFlowPlayer({
    textOf,
    openFile: (path) => manager.openFile(path),
    animator: stage === null ? noopBeat : stage.animator,
    camera: stage === null ? noopCam : stage.camera,
    clock: systemClock,
    currentViewport: () => canvas.ctrlRef.current?.viewport ?? { x: 0, y: 0, k: 1 },
  });

  // Canvas rects → the runner (screen space converted with the viewport).
  useEffect(() => {
    player.setRectProvider({
      rectOf: (id) => {
        const svg = canvas.svgRef.current;
        const v = canvas.ctrlRef.current?.viewport ?? { x: 0, y: 0, k: 1 };
        const r = svg === null ? null : screenRectOf(svg, id);
        return r === null
          ? null
          : { x: (r.x - v.x) / v.k, y: (r.y - v.y) / v.k, w: r.w / v.k, h: r.h / v.k };
      },
    });
  });

  return player;
}
