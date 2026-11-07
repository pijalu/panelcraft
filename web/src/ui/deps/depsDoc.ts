// SPDX-License-Identifier: GPL-3.0-only
// Dependencies view model (M6-WP4, FR-V-table "dependencies view"): adjacency
// for the selected element + deps-focus fade sets. Pure; no DOM.
import type { Doc } from '../../engine/model/types';
import { fadeSets, type EffectiveView } from '../views/viewDoc';

export interface DepEntry {
  /** Canvas link id (l.id ?? `from-to`, mirroring the workspace projection). */
  linkId: string;
  peerId: string;
  label?: string;
  type: string;
}

export interface Adjacency {
  incoming: DepEntry[];
  outgoing: DepEntry[];
}

/** Link ids use the canvas rule `l.id ?? from-to` (single edge per pair here). */
export function canvasLinkId(from: string, to: string, id?: string): string {
  return id ?? `${from}-${to}`;
}

/** Incoming (to === id) and outgoing (from === id) links with peer ids. */
export function adjacency(doc: Doc, id: string): Adjacency {
  const incoming: DepEntry[] = [];
  const outgoing: DepEntry[] = [];
  for (const l of doc.links) {
    if (l.from === id) {
      outgoing.push({ linkId: canvasLinkId(l.from, l.to, l.id), peerId: l.to, label: l.label, type: l.type ?? 'uses' });
    }
    if (l.to === id) {
      incoming.push({ linkId: canvasLinkId(l.from, l.to, l.id), peerId: l.from, label: l.label, type: l.type ?? 'uses' });
    }
  }
  return { incoming, outgoing };
}

/**
 * Deps-focus fade (FR-V "dependencies view"): with an active selection the
 * non-adjacent world fades (active object + neighbors + their links stay
 * crisp); without one the view's own fade state applies unchanged.
 */
export function depsFade(
  doc: Doc,
  ev: EffectiveView,
  activeId: string | null,
): { objects: Set<string>; links: Set<string> } {
  if (activeId === null || !doc.objects.some((o) => o.id === activeId)) {
    return fadeSets(doc, ev);
  }
  const { incoming, outgoing } = adjacency(doc, activeId);
  const peers = new Set([activeId, ...incoming.map((e) => e.peerId), ...outgoing.map((e) => e.peerId)]);
  const keepLinks = new Set([...incoming, ...outgoing].map((e) => e.linkId));
  const objects = new Set<string>();
  for (const o of doc.objects) if (!peers.has(o.id)) objects.add(o.id);
  const links = new Set<string>();
  for (const l of doc.links) {
    const lid = canvasLinkId(l.from, l.to, l.id);
    if (!keepLinks.has(lid)) links.add(lid);
  }
  return { objects, links };
}
