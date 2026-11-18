// SPDX-License-Identifier: GPL-3.0-only
// One flow-editing session for a file: the pending source text plus the single
// write path. The Flow Steps list and the Properties panel are two views of the
// same document, so they must not each keep their own pending buffer — two
// buffers would race the asynchronous file round-trip and drop edits.
import { useRef } from 'preact/hooks';
import { parsePDL } from '../../engine/format/parser';
import type { Doc } from '../../engine/model/types';
import { retext } from './flowDoc';

/** Parse for an editor; a blank file counts as an empty document. */
export function parseForEditor(text: string): Doc | null {
  return parsePDL(text.trim() === '' ? 'pcd 1.0\n' : text).doc;
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
  const seen = useRef(version);
  // Latest writer without re-creating the session object on every render.
  const write = useRef(onChangeText);
  write.current = onChangeText;
  if (seen.current !== version) {
    seen.current = version;
    pending.current = text;
  }
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
