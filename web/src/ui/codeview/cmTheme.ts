// SPDX-License-Identifier: GPL-3.0-only
// CodeMirror theme (M4-WP1) — token colors mapped to the app CSS variables
// (--pc-*, light + dark). The editor chrome follows the CSS variables via
// .cm-editor rules in app.css; syntax highlighting uses two HighlightStyles
// scoped with light/dark classes so the media query picks one.
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const pcTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace' },
  '.cm-gutters': { borderRight: '1px solid var(--pc-border)', background: 'var(--pc-surface)' },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--pc-accent) 8%, transparent)' },
  '.cm-activeLineGutter': { background: 'color-mix(in srgb, var(--pc-accent) 12%, transparent)' },
});

/** Token classes; actual colors live in app.css (light/dark CSS variables). */
export const pcHighlight = HighlightStyle.define([
  { tag: t.keyword, class: 'pc-tok-kw' },
  { tag: t.string, class: 'pc-tok-str' },
  { tag: [t.number, t.color], class: 'pc-tok-num' },
  { tag: t.comment, class: 'pc-tok-com' },
  { tag: t.operator, class: 'pc-tok-op' },
  { tag: t.variableName, class: 'pc-tok-id' },
  { tag: t.meta, class: 'pc-tok-meta' },
]);

export const pcHighlightExtension = syntaxHighlighting(pcHighlight);
