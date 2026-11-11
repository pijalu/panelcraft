// SPDX-License-Identifier: GPL-3.0-only
// FR-C1 mini-map: bounded-cost canvas overview with a DOM viewport indicator.
import { useEffect, useRef, useState } from 'preact/hooks';
import { IDENTITY, type Point, type Size, type Transform } from '../engine/render/viewport';
import type { Snapshot } from './CanvasController';
import { buildMiniMap, miniMapPointToCanvas, type MiniMapLayout } from './miniMapGeometry';
import { s } from './strings';

export interface MiniMapController {
  centerOn(point: Point): void;
  panBy(dx: number, dy: number): void;
  fitDiagram(): void;
}

const MAP_SIZE = { w: 180, h: 120 } as const;

function drawOverview(canvas: HTMLCanvasElement, snapshot: Snapshot, layout: MiniMapLayout): void {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = MAP_SIZE.w * ratio;
  canvas.height = MAP_SIZE.h * ratio;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  ctx.scale(ratio, ratio);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--pc-muted').trim() || '#737b87';
  const accent = css.getPropertyValue('--pc-accent').trim() || '#2563eb';
  ctx.clearRect(0, 0, MAP_SIZE.w, MAP_SIZE.h);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  const byId = new Map(snapshot.objects.map((object, index) => [object.id, layout.objects[index]]));
  snapshot.links.forEach((link) => {
    const a = byId.get(link.from);
    const b = byId.get(link.to);
    if (!a || !b) return;
    ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
    ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
  });
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  snapshot.objects.forEach((object, index) => {
    const rect = layout.objects[index];
    if (!rect) return;
    ctx.fillStyle = object.style?.fill ?? ink;
    ctx.strokeStyle = object.kind === 'group' ? accent : ink;
    ctx.setLineDash(object.kind === 'group' || object.dashed === true ? [2, 2] : []);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export function MiniMap(props: {
  snapshot: Snapshot | null;
  controller: MiniMapController | null;
  viewSize: Size;
  canvasElement?: SVGSVGElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<MiniMapLayout | null>(null);
  const [observedSize, setObservedSize] = useState(props.viewSize);
  const [camera, setCamera] = useState<Transform | null>(null);
  const { snapshot, controller, canvasElement } = props;
  useEffect(() => {
    if (!canvasElement) return undefined;
    const resize = (): void => {
      const rect = canvasElement.getBoundingClientRect();
      setObservedSize({ w: rect.width || props.viewSize.w, h: rect.height || props.viewSize.h });
    };
    const onCamera = (e: Event): void => setCamera((e as CustomEvent<Transform>).detail);
    resize();
    canvasElement.addEventListener('pc-camera', onCamera);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvasElement);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      canvasElement.removeEventListener('pc-camera', onCamera);
    };
  }, [canvasElement]);
  useEffect(() => setCamera(null), [snapshot?.viewport]);
  const empty = snapshot === null || snapshot.objects.length === 0;
  const viewSize = canvasElement ? observedSize : props.viewSize;
  const layout = empty ? null : buildMiniMap(snapshot.objects, camera ?? snapshot.viewport ?? IDENTITY, viewSize, MAP_SIZE);
  if (layout !== null) layoutRef.current = layout;
  useEffect(() => {
    if (canvasRef.current !== null && snapshot !== null && layout !== null) {
      drawOverview(canvasRef.current, snapshot, layout);
    }
  }, [snapshot, layout]);
  if (empty || controller === null || layout === null) return null;
  const pan = (dx: number, dy: number): void => controller.panBy(dx, dy);
  return (
    <div class="mini-map-shell">
      <button
        type="button"
        class="mini-map"
        data-testid="mini-map"
        aria-label={s('Mini-map navigation')}
        aria-describedby="mini-map-help"
        onClick={(e) => {
          if (e.detail === 0) return; // keyboard activation keeps the current centre
          const rect = e.currentTarget.getBoundingClientRect();
          const current = layoutRef.current;
          if (current === null) return;
          controller.centerOn(miniMapPointToCanvas(current, { x: e.clientX - rect.left, y: e.clientY - rect.top }));
        }}
        onKeyDown={(e) => {
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40],
          };
          if (e.key === 'Home') {
            e.preventDefault();
            controller.fitDiagram();
            return;
          }
          const move = moves[e.key];
          if (move) {
            e.preventDefault();
            pan(move[0], move[1]);
          }
        }}
      >
        <canvas ref={canvasRef} class="mini-map-canvas" data-testid="mini-map-canvas" aria-hidden="true" />
        <span
          class="mini-map-viewport"
          data-testid="mini-map-viewport"
          aria-hidden="true"
          style={{
            left: `${layout.viewport.x}px`, top: `${layout.viewport.y}px`,
            width: `${layout.viewport.w}px`, height: `${layout.viewport.h}px`,
          }}
        />
      </button>
      <span id="mini-map-help" class="visually-hidden">
        {s('Diagram overview. Click a location to center it. Arrow keys pan; Home fits the diagram.')}
      </span>
    </div>
  );
}
