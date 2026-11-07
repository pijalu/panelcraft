// SPDX-License-Identifier: GPL-3.0-only
// Minimal-diff computation for machine→editor writes (F-03; review §2 D4).
//
// A full-document replacement destroys the caret: CodeMirror maps a selection
// through a change, and a change spanning the whole document can only map the
// caret to the edge. Computing the common prefix/suffix keeps every untouched
// region — and therefore the caret — where the user left it.

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Smallest single replacement turning `before` into `after`.
 *
 * `from`/`to` index `before`; `insert` is the replacement text. When the texts
 * differ only by trailing whitespace the change is empty (`from === to`,
 * `insert === ''`), which callers use to skip the dispatch entirely.
 */
export function minimalChange(before: string, after: string): TextChange {
  if (before === after) return { from: 0, to: 0, insert: '' };
  const max = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < max && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  // never split a surrogate pair: a lone high surrogate would be invalid text
  if (prefix > 0 && isHighSurrogate(before.charCodeAt(prefix - 1))) prefix--;
  if (suffix > 0 && isHighSurrogate(before.charCodeAt(before.length - suffix - 1))) suffix--;

  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** True when `a` and `b` differ only in trailing whitespace (no dispatch needed). */
export function trailingWhitespaceOnly(a: string, b: string): boolean {
  return a.replace(/\s+$/, '') === b.replace(/\s+$/, '');
}
