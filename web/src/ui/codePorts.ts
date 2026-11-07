// SPDX-License-Identifier: GPL-3.0-only
// Code-side command ports (F-24). The editor owns its undo history, so the
// shell needs a way to ask for "undo in the code view" without reaching into
// CodeMirror: the editor installs these, the history affordance calls them.
// Null while no editor is mounted.
export const codePorts: {
  undo: (() => void) | null;
  redo: (() => void) | null;
} = { undo: null, redo: null };
