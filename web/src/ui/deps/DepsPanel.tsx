// SPDX-License-Identifier: GPL-3.0-only
// DepsPanel (M6-WP4): incoming/outgoing link list for the selected object,
// click-through selects the peer (controller.reveal). Owns the canvas fade:
// deps-focus (non-adjacent world fades) while an object is selected; the
// active view's fade otherwise — single writer, no ViewBar interplay.
import { useEffect, useMemo } from 'preact/hooks';
import { parsePDL } from '../../engine/format/parser';
import type { Doc } from '../../engine/model/types';
import type { CanvasController } from '../CanvasController';
import { effectiveLayout } from '../layoutDoc';
import { adjacency, depsFade, type DepEntry } from './depsDoc';
import { s } from '../strings';

export interface DepsPanelProps {
  text: string | null;
  filePath: string | null;
  /** Selected object id (objects only; links don't get a deps panel). */
  activeId: string | null;
  ctrl: CanvasController | null;
  /** Click-through: reveal + select the peer object on canvas. */
  onPick(id: string): void;
}

function DepRows(props: { entries: DepEntry[]; testid: string; onPick(id: string): void; empty: string }) {
  if (props.entries.length === 0) return <div class="deps-empty">{props.empty}</div>;
  return (
    <ul class="deps-list" data-testid={props.testid}>
      {props.entries.map((e) => (
        <li key={e.linkId}>
          <button type="button" class="deps-row" onClick={() => props.onPick(e.peerId)}>
            <span class="deps-peer">{e.peerId}</span>
            <span class="deps-type">{e.type}</span>
            {e.label && <span class="deps-label">{e.label}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DepsPanel(props: DepsPanelProps) {
  const doc: Doc | null = useMemo(() => {
    if (props.text === null) return null;
    const { doc: d } = parsePDL(props.text);
    return d;
  }, [props.text]);

  const ev = useMemo(() => (doc ? effectiveLayout(doc) : null), [doc]);

  // Fade ownership: deps focus while an object is selected; view fade else.
  // No file → clear (canvas may outlive the file).
  useEffect(() => {
    const ctrl = props.ctrl;
    if (!ctrl) return;
    if (!doc || !ev) {
      ctrl.setFaded(new Set(), new Set());
      return;
    }
    const f = depsFade(doc, ev, props.activeId);
    ctrl.setFaded(f.objects, f.links);
  }, [props.ctrl, doc, ev, props.activeId]);

  if (!doc) return null;
  const adj = props.activeId !== null ? adjacency(doc, props.activeId) : { incoming: [], outgoing: [] };
  const activeObj = doc.objects.find((o) => o.id === props.activeId);

  return (
    <section class="deps-panel" data-testid="deps-panel" tabIndex={0} aria-label={s("dependencies")}>
      <h3 class="deps-title">
        {s("dependencies")}{props.filePath ? ` · ${props.filePath}` : ''}
        {activeObj ? ` · ${activeObj.name ?? activeObj.id}` : ''}
      </h3>
      {props.activeId === null && <div class="deps-empty">{s("select an object to see its dependencies")}</div>}
      {props.activeId !== null && (
        <>
          <div class="deps-sub">{s("incoming")}</div>
          <DepRows entries={adj.incoming} testid="deps-incoming" onPick={props.onPick} empty="none" />
          <div class="deps-sub">{s("outgoing")}</div>
          <DepRows entries={adj.outgoing} testid="deps-outgoing" onPick={props.onPick} empty="none" />
        </>
      )}
    </section>
  );
}
