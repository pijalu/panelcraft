// SPDX-License-Identifier: GPL-3.0-only
// One resolution and edit path for the animation shared by every flow step that
// names a connector. A step stores an endpoint pair or a link reference, never
// its own busyness; the values live in the link's style block. Unknown or
// ambiguous references stop the edit instead of guessing which link to change.
import type { Doc, Link, StyleBlock } from '../model/types';
import { resolveMsg } from './plan';

/** The subset of a message step needed to identify its connector. */
export interface MsgStepLike {
  from: string;
  to: string;
  label?: string;
  linkRef?: string;
  flip?: boolean;
}

/** PDL bounds from FILE-FORMAT §7.3; both spark editors use these numbers. */
export const SPARK_COUNT_BOUNDS = { min: 1, max: 8 } as const;
export const SPARK_SPEED_BOUNDS = { min: 0.25, max: 4, step: 0.25 } as const;

export function validSparkCount(value: number): boolean {
  return Number.isInteger(value) && value >= SPARK_COUNT_BOUNDS.min && value <= SPARK_COUNT_BOUNDS.max;
}

export function validSparkSpeed(value: number): boolean {
  return Number.isFinite(value) && value >= SPARK_SPEED_BOUNDS.min && value <= SPARK_SPEED_BOUNDS.max;
}

/** `null` restores the unprinted default (one token, default speed). */
export interface LinkStylePatch {
  sparks?: number | null;
  speed?: number | null;
}

export type LinkStyleTarget =
  | { status: 'ok'; link: Link; index: number }
  | { status: 'unresolved-ref'; ref: string }
  | { status: 'ambiguous'; count: number }
  | { status: 'missing' };

/** Direction-insensitive fallback used only when no explicit reference exists. */
function endpointMatch(link: Link, step: MsgStepLike): boolean {
  return (
    (link.from === step.from && link.to === step.to) ||
    (link.from === step.to && link.to === step.from)
  );
}

/**
 * Resolve the connector a message step animates. An authored reference wins and
 * is never replaced by a fallback when it is invalid; without one, a unique
 * direction-insensitive endpoint match is accepted and several matches stop.
 */
export function resolveMsgLink(doc: Doc, step: MsgStepLike): LinkStyleTarget {
  if (step.linkRef !== undefined) {
    const found = resolveMsg(doc, step);
    return found === null
      ? { status: 'unresolved-ref', ref: step.linkRef }
      : { status: 'ok', ...found };
  }
  const matches = doc.links.flatMap((link, index) => endpointMatch(link, step) ? [index] : []);
  if (matches.length > 1) return { status: 'ambiguous', count: matches.length };
  const found = resolveMsg(doc, step);
  return found === null ? { status: 'missing' } : { status: 'ok', ...found };
}

function validPatch(patch: LinkStylePatch): boolean {
  return (
    (patch.sparks === undefined || patch.sparks === null || validSparkCount(patch.sparks)) &&
    (patch.speed === undefined || patch.speed === null || validSparkSpeed(patch.speed))
  );
}

/** Apply one field; `null` removes it (back to the unprinted default). */
function setStyleValue(style: StyleBlock, key: 'sparks' | 'speed', value: number | null | undefined): boolean {
  if (value === undefined) return false;
  if (value === null) {
    if (style[key] === undefined) return false;
    delete style[key];
    return true;
  }
  if (style[key] === value) return false;
  style[key] = value;
  return true;
}

/**
 * The single shared-style edit: patch the resolved link, never the step. Works
 * on a caller-owned parsed document, so `retext` keeps being the only writer of
 * file text. Invalid values or unresolved links change nothing.
 */
export function patchMsgLinkStyle(doc: Doc, step: MsgStepLike, patch: LinkStylePatch): boolean {
  if (!validPatch(patch)) return false;
  const target = resolveMsgLink(doc, step);
  if (target.status !== 'ok') return false;

  const style = { ...target.link.style };
  const sparksChanged = setStyleValue(style, 'sparks', patch.sparks);
  const speedChanged = setStyleValue(style, 'speed', patch.speed);
  if (!sparksChanged && !speedChanged) return false;
  if (Object.keys(style).length === 0) delete target.link.style;
  else target.link.style = style;
  return true;
}
