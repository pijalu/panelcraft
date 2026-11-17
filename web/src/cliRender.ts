// SPDX-License-Identifier: GPL-3.0-only
// Isolated browser entry for `panelcraft render` (SPEC S6/FR-X). No workspace,
// IndexedDB, service worker or network access: the Go CLI supplies PDL directly.
import { parsePDL } from './engine/format/parser';
import { dagreLayoutGeometry } from './engine/layout/dagre';
import { fitRect, unionRects } from './engine/render/viewport';
import { CanvasController, DEFAULT_SHAPE } from './ui/CanvasController';
import { docToState } from './workspace/workspace';
import { iconAssetsOf } from './engine/render/iconAssets';
import { exportSvg } from './workspace/io';
import { effectiveLayout, fadeSets } from './ui/layoutDoc';

export interface CliRenderOptions {
  width: number;
  height?: number;
  theme: 'light' | 'dark';
}

export interface CliRenderResult {
  svg: string;
  width: number;
  height: number;
}

const THEME_VARS = [
  '--pc-bg', '--pc-surface', '--pc-fg', '--pc-muted', '--pc-accent', '--pc-info',
  '--pc-warn', '--pc-border', '--pc-canvas', '--pc-match', '--pc-text-xs', '--pc-text-sm',
  '--pc-text-md', '--pc-radius-sm', '--pc-radius-md',
] as const;

function parseSource(source: string) {
  const result = parsePDL(source);
  const failure = result.diagnostics.find((d) => d.severity === 'error');
  if (result.doc === null || failure) {
    const d = failure ?? result.diagnostics[0];
    throw new Error(d ? `${d.code} at ${d.line}:${d.col}: ${d.message}` : 'PDL parse failed');
  }
  return result.doc;
}

/** CSS is bundled locally; embed it so the serialized SVG is standalone. */
function embeddedStyles(): string {
  return Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules).map((rule) => rule.cssText))
    .join('\n');
}

function standaloneSvg(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const computed = getComputedStyle(document.documentElement);
  const vars = THEME_VARS.map((name) => `${name}:${computed.getPropertyValue(name).trim()};`).join('');
  const inlineStyle = `${vars}width:${width}px;height:${height}px;background:var(--pc-canvas);`;
  clone.setAttribute('style', inlineStyle);
  // Chrome captures PNG after renderDiagram restores the application root.
  // Freeze the same explicit CLI palette on the live SVG for that screenshot.
  svg.setAttribute('style', inlineStyle);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = embeddedStyles();
  clone.insertBefore(style, clone.firstChild);
  return exportSvg(clone);
}


/** Render PDL synchronously after the browser bundle has loaded. */
export function renderDiagram(source: string, options: CliRenderOptions): CliRenderResult {
  const root = document.documentElement;
  const previous = root.dataset.theme;
  root.dataset.theme = options.theme;
  try {
    return renderDiagramInTheme(source, options);
  } finally {
    if (previous === undefined) delete root.dataset.theme;
    else root.dataset.theme = previous;
  }
}

function renderDiagramInTheme(source: string, options: CliRenderOptions): CliRenderResult {
  const doc = parseSource(source);
  const width = options.width;
  const height = options.height ?? Math.round(width * 9 / 16);
  if (!Number.isFinite(width) || width <= 0) throw new Error('width must be a positive number');

  document.querySelectorAll('[data-cli-render-root]').forEach((el) => el.remove());
  const root = document.createElement('div');
  root.dataset.cliRenderRoot = 'true';
  root.setAttribute('style', `width:${width}px;height:${height}px;background:var(--pc-canvas);`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pc-canvas');
  svg.dataset.cliRender = 'true';
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  root.appendChild(svg);
  document.body.appendChild(root);

  const ctrl = new CanvasController(svg);
  ctrl.setIconAssets(iconAssetsOf(doc)); // IR v9: document icons render in exports
  try {
    ctrl.loadState(docToState(doc));
    const ev = effectiveLayout(doc);
    if (ev.layout.mode === 'auto') {
      const current = ctrl.currentPositions();
      const parentOf = new Map<string, string>();
      for (const o of doc.objects) {
        for (const child of o.contains ?? []) parentOf.set(child, o.id);
      }
      const nodes = doc.objects.map((o) => ({
        id: o.id,
        parent: parentOf.get(o.id),
        size: { width: DEFAULT_SHAPE[o.kind]?.w ?? 120, height: DEFAULT_SHAPE[o.kind]?.h ?? 60 },
        pinnedAt: ev.pins.has(o.id) ? (ev.positions.get(o.id) ?? current[o.id]) : undefined,
      }));
      const edges = doc.links.map((l) => ({ from: l.from, to: l.to, label: l.label }));
      const geometry = dagreLayoutGeometry(nodes, edges, { dir: ev.layout.dir });
      ctrl.applyPositions(geometry.positions);
      const positioned = ctrl.snapshot;
      ctrl.loadState({
        ...positioned,
        objects: positioned.objects.map((o) => {
          const size = o.kind === 'group' ? geometry.sizes[o.id] : undefined;
          return size ? { ...o, w: size.width, h: size.height, size: { w: size.width, h: size.height } } : o;
        }),
      });
    }
    const faded = fadeSets(doc, ev);
    ctrl.setFaded(faded.objects, faded.links);
    const bounds = unionRects(ctrl.snapshot.objects);
    if (bounds) ctrl.applyCamera(fitRect(bounds, { w: width, h: height }));
    return { svg: standaloneSvg(svg, width, height), width, height };
  } finally {
    ctrl.destroy();
  }
}
