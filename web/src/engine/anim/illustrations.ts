// SPDX-License-Identifier: GPL-3.0-only
// Illustration registry (F-17; review §3.5): how a beat is drawn. The planner
// is untouched — a beat carries what happens, the registry decides how it looks.
// Each flow picks one style in its header; `auto` follows the beat kind.

export type IllustrationId =
  | 'travel-token'
  | 'pulse'
  | 'sequential-glow'
  | 'packet-burst'
  | 'compare-split'
  | 'trail-fade';

export interface IllustrationMeta {
  id: IllustrationId;
  label: string;
  /** One line for the tooltip / user guide. */
  hint: string;
}

export const ILLUSTRATIONS: Record<IllustrationId, IllustrationMeta> = {
  'travel-token': {
    id: 'travel-token',
    label: 'travel token',
    hint: 'a token glides along the link with a trailing dash',
  },
  pulse: { id: 'pulse', label: 'pulse', hint: 'the actors pulse in place' },
  'sequential-glow': {
    id: 'sequential-glow',
    label: 'sequential glow',
    hint: 'actors glow one after another (parallel lanes)',
  },
  'packet-burst': {
    id: 'packet-burst',
    label: 'packet burst',
    hint: 'a small burst of packets leaves the actor',
  },
  'compare-split': {
    id: 'compare-split',
    label: 'compare split',
    hint: 'the alternatives are highlighted side by side',
  },
  'trail-fade': {
    id: 'trail-fade',
    label: 'trail fade',
    hint: 'a fading trail sweeps the link (no token)',
  },
};

export const ILLUSTRATION_IDS = Object.keys(ILLUSTRATIONS) as IllustrationId[];

/** Beat kind → the illustration that reads best for it. */
export function defaultIllustration(kind: string): IllustrationId {
  switch (kind) {
    case 'msg':
      return 'travel-token';
    case 'process':
    case 'goto':
      return 'pulse';
    case 'par':
      return 'sequential-glow';
    case 'info':
      return 'packet-burst';
    case 'alt':
      return 'compare-split';
    default:
      return 'trail-fade'; // intro / conclusion
  }
}

/**
 * Illustration for a beat: an explicit flow choice wins, except that a `msg`
 * beat with no animated link has nothing to travel — it falls back to the
 * artefact-free default. `null` = auto.
 */
export function resolveIllustration(
  selected: IllustrationId | null | undefined,
  kind: string,
  linkCount: number,
): IllustrationId {
  const chosen = selected ?? defaultIllustration(kind);
  if ((chosen === 'travel-token' || chosen === 'trail-fade') && linkCount === 0) {
    return defaultIllustration(kind);
  }
  return chosen;
}
