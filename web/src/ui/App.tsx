// SPDX-License-Identifier: GPL-3.0-only
// App shell (M2): palette | canvas | properties. The canvas owns its imperative
// controller (ADR-0001: Preact renders chrome around the SVG, never inside it);
// panels re-render from controller snapshots via onState.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CanvasController, PALETTE_ORDER, type Snapshot } from './CanvasController';
import { labelFor } from './CanvasController';
import type { Kind } from '../engine/model/types';
import { PropertiesPanel } from './PropertiesPanel';
import { Palette } from './Palette';

export function App() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctrl = new CanvasController(svg, {
      onState: (s) => setSnap({ ...s }),
      onRenameRequest: () => nameFieldRef.current?.focus(),
    });
    ctrlRef.current = ctrl;
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, []);

  /** Palette drag-drop: pointer-based (no HTML5 DnD), drop = shape center. */
  const onPaletteDrop = (kind: Kind, e: PointerEvent): void => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = ctrl.viewport;
    const canvasPt = {
      x: (e.clientX - rect.left - p.x) / p.k,
      y: (e.clientY - rect.top - p.y) / p.k,
    };
    ctrl.addObject(kind, canvasPt);
  };

  const ctrl = ctrlRef.current;
  const selectedObj =
    snap && snap.selection.objects.length === 1
      ? snap.objects.find((o) => o.id === snap.selection.objects[0]) ?? null
      : null;
  const selectedLink =
    snap && snap.selection.links.length === 1
      ? snap.links.find((l) => l.id === snap.selection.links[0]) ?? null
      : null;

  return (
    <div class="app-shell" data-testid="app-shell">
      <header class="app-header">
        <span class="app-title">PanelCraft</span>
        <span class="muted">M2 canvas — drag shapes from the palette, link via edge handles</span>
      </header>
      <div class="app-body">
        <Palette kinds={PALETTE_ORDER} onPlace={(k) => ctrl?.addObject(k)} onDragDrop={onPaletteDrop} />
        <main class="canvas-wrap">
          <svg
            ref={svgRef}
            class="pc-canvas"
            data-testid="canvas"
            width="100%"
            height="100%"
          />
        </main>
        <PropertiesPanel
          obj={selectedObj}
          link={selectedLink}
          nameFieldRef={nameFieldRef}
          onChangeObject={(id, patch) => ctrl?.updateObject(id, patch)}
          onChangeLink={(id, patch) => ctrl?.updateLink(id, patch)}
        />
      </div>
    </div>
  );
}

export { labelFor };
