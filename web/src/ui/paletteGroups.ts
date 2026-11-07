// SPDX-License-Identifier: GPL-3.0-only
// Palette grouping by C4 level (F-25 / Hick's law): nine stencils exposed at
// once is too many choices, so they are grouped into the three levels people
// actually think in, plus a "structural" bucket for group/note.
import type { Kind } from '../engine/model/types';

export type PaletteGroupId = 'context' | 'container' | 'component' | 'structural';

export interface PaletteGroup {
  id: PaletteGroupId;
  title: string;
  kinds: Kind[];
}

const GROUP_OF: Record<Kind, PaletteGroupId> = {
  person: 'context',
  system: 'context',
  system_ext: 'context',
  container: 'container',
  datastore: 'container',
  queue: 'container',
  component: 'component',
  group: 'structural',
  note: 'structural',
};

const TITLES: Record<PaletteGroupId, string> = {
  context: 'Context',
  container: 'Container',
  component: 'Component',
  structural: 'Structure',
};

/** Group `kinds`, preserving the caller's order inside each group. */
export function groupKinds(kinds: Kind[]): PaletteGroup[] {
  const out: PaletteGroup[] = [];
  for (const kind of kinds) {
    const id = GROUP_OF[kind] ?? 'structural';
    let group = out.find((g) => g.id === id);
    if (group === undefined) {
      group = { id, title: TITLES[id], kinds: [] };
      out.push(group);
    }
    group.kinds.push(kind);
  }
  return out;
}

/** Quick-add key (1-based position in the *flat* list) for docs/tooltips. */
export function quickAddKey(kinds: Kind[], kind: Kind): number {
  return kinds.indexOf(kind) + 1;
}
