// SPDX-License-Identifier: GPL-3.0-only
// Hover info card (F-25, working memory): the canvas answers "what is this?"
// without a trip to the properties panel.
import type { Kind } from '../engine/model/types';

export interface HoverInfo {
  id: string;
  kind: Kind;
  name: string;
  technology?: string;
  description?: string;
  tags?: string[];
}

/**
 * One-line summary for the card body: technology, description and tags, in the
 * order a reader wants them. Null when the object has nothing extra to say —
 * the caller then shows only the name.
 */
export function hoverDetail(info: HoverInfo): string | null {
  const parts: string[] = [];
  if (info.technology !== undefined && info.technology !== '') parts.push(info.technology);
  if (info.description !== undefined && info.description !== '') parts.push(info.description);
  if (info.tags !== undefined && info.tags.length > 0) parts.push(info.tags.map((t) => `#${t}`).join(' '));
  return parts.length === 0 ? null : parts.join(' · ');
}
