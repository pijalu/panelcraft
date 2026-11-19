// SPDX-License-Identifier: GPL-3.0-only
// One flow-editing session for a file: the pending source text plus the single
// write path. The Flow Steps list and the Properties panel are two views of the
// same document, so they must not each keep their own pending buffer — two
// buffers would race the asynchronous file round-trip and drop edits.
import { useRef } from 'preact/hooks';
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Doc, Link } from '../../engine/model/types';
import type { SyncSnapshot } from '../codeview/sync';
import { retext } from './flowDoc';

/** Parse for an editor; a blank file counts as an empty document. */
export function parseForEditor(text: string): Doc | null {
  return parsePDL(text.trim() === '' ? 'pcd 1.0\n' : text).doc;
}

/**
 * Text the flow session should reconcile with. While an edit or undo is in
 * flight, the code buffer is newer than the file. Once sync is clean, the file
 * is authoritative: its canvas projection can briefly be ahead of that buffer.
 */
export function flowSessionText(
  sourceText: string,
  sync: Pick<SyncSnapshot, 'state' | 'codeText'>,
): string {
  return sync.state === 'clean' ? sourceText : sync.codeText;
}

/** Preserve a local flow write while rebasing it onto a newer canvas document. */
function mergeFlowEdits(incoming: string, pending: string): string {
  const next = parseForEditor(incoming);
  const local = parseForEditor(pending);
  if (next === null || local === null) return incoming;
  next.flows = local.flows;
  local.links.forEach((link, index) => {
    const target = next.links[index];
    if (target === undefined || target.from !== link.from || target.to !== link.to) return;
    copyFlowLinkMetadata(link, target, next.links);
  });
  return printDoc(next);
}

/** Link ids and animation are editable through Flow Steps; geometry is not. */
function copyFlowLinkMetadata(source: Link, target: Link, all: Link[]): void {
  if (source.id !== undefined && target.id === undefined && !all.some((link) => link.id === source.id)) {
    target.id = source.id;
  }
  if (source.style?.sparks !== undefined) {
    target.style = { ...target.style, sparks: source.style.sparks };
  }
  if (source.style?.speed !== undefined) {
    target.style = { ...target.style, speed: source.style.speed };
  }
}

export interface FlowSession {
  /** Base text for the next edit (the last locally applied source). */
  read(): string;
  /** Apply one document mutation and hand the printed result to the writer. */
  apply(mutate: (doc: Doc) => void): void;
}

/**
 * The pending text is the last source this session produced. The file round-trip
 * is asynchronous, so a second edit immediately after the first must build on the
 * first result rather than on text that has not been applied yet. A workspace
 * version bump means the file is authoritative again and wins.
 */
export function useFlowSession(
  text: string,
  version: number,
  onChangeText: (next: string) => void,
): FlowSession {
  const pending = useRef(text);
  const renderedText = useRef(text);
  const seen = useRef(version);
  // Latest writer without re-creating the session object on every render.
  const write = useRef(onChangeText);
  write.current = onChangeText;
  if (seen.current !== version) {
    seen.current = version;
    pending.current = text;
  } else if (renderedText.current !== text && pending.current !== text) {
    // Canvas writes can become visible before the persistence version moves.
    // Adopt that newer source; otherwise the next flow print omits its shapes.
    pending.current = pending.current === renderedText.current
      ? text
      : mergeFlowEdits(text, pending.current);
  }
  renderedText.current = text;
  return {
    read: () => pending.current,
    apply: (mutate) => {
      const next = retext(pending.current, mutate);
      if (next === null) return;
      pending.current = next;
      write.current(next);
    },
  };
}
