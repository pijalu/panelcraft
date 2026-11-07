// SPDX-License-Identifier: GPL-3.0-only
// Canvas ↔ code highlight (F-22): the statement matching the canvas selection
// gets a line decoration. A decoration is used instead of moving the caret so
// highlighting never steals focus or clobbers the user's selection.
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/** Set (or clear, with null) the highlighted character range. */
export const setHighlight = StateEffect.define<{ from: number; to: number } | null>();

const lineDeco = Decoration.line({ class: 'pc-code-highlight' });

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setHighlight)) continue;
      if (effect.value === null) {
        next = Decoration.none;
        continue;
      }
      const { from, to } = effect.value;
      const builder = new RangeSetBuilder<Decoration>();
      const first = tr.state.doc.lineAt(from).number;
      const last = tr.state.doc.lineAt(to).number;
      for (let n = first; n <= last; n += 1) {
        builder.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from, lineDeco);
      }
      next = builder.finish();
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Extension that renders `.pc-code-highlight` on highlighted lines. */
export const highlightExtension: Extension = field;
