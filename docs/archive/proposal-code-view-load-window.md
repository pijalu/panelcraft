# Proposal — the code view accepts typing while a document is still loading

Status: proposed, not implemented. No behaviour in this repository changed yet.

This is the app-side defect recorded at the end of
[bugs-ci-e2e-determinism.md](bugs-ci-e2e-determinism.md). The test harness works around
it; the product still has it.

## The defect

The code view is offered for typing before it holds the text of the document being
opened. `useCodeSync` keeps `loaded` sticky for the whole App lifetime
(`web/src/ui/useCodeSync.ts`, `const [loaded, setLoaded] = useState(false)`), and
`CodePane` uses it to choose between the editor and the "Loading the file…" placeholder.
It is set to `true` after the first file loads and never returns to `false`.

The comment that introduced it states the rule it is supposed to enforce:

> Until then the editor is not shown: an empty buffer that merely reports "clean" must
> never accept typing, or the incoming file text would overwrite what the user just
> wrote.

That rule is enforced at startup and dropped on every file switch. Switching files
changes `documentKey`, and the load effect then runs `machine.loadFile(text)` after the
render that made the new file active. Between those two moments the editor shows the
*previous* document, is editable, and reports `clean`.

## What is established, and what is not

Established by probe (Playwright against a production build):

- The CodeMirror view survives a file switch — a marker property put on `.cm-content`
  was still there after a new file became active, so the same DOM node received the
  incoming text. The view is not rebuilt under the caret.
- A machine write into a focused buffer keeps the editor usable: formatting with
  `Shift+Alt+F` kept focus, and the next select-all still selected the buffer
  (50 of 53 characters — the remainder is the trailing line), after which typing
  replaced rather than appended.
- Typing immediately after a file switch is clean in 60 of 60 trials at six concurrent
  workers: the new document's text was already in the buffer when the click resolved.

Not established: which interleaving produced the corrupted buffer seen under CI load
(the previous document with the seed's first line appended, `E100 duplicate magic
line`). It has not reproduced locally. The proposed change therefore closes the window
rather than the interleaving: it makes the state the code already says is unsafe
impossible to reach, which is worth doing whether or not that was the trigger.

## Proposed change

Two parts, both small.

### 1. Readiness is per document, not per App lifetime

```ts
// useCodeSync.ts — replace the sticky flag with the key it was loaded for.
const [loadedKey, setLoadedKey] = useState<string | null>(null);
const loaded = loadedKey === documentKey;      // documentKey is already computed
```

and set it where the text actually enters the machine (already inside the load effect):

```ts
machine.loadFile(text);
setLoadedKey(documentKey);
```

`documentKey === null` (no file open) stays loaded, as today, because the empty buffer
*is* the document then.

### 2. Keep the view mounted, but not editable, while a document is in flight

Today `CodePane` swaps the editor for a placeholder, so gating on `loaded` alone would
unmount CodeMirror on every file switch and throw away scroll position and cursor —
the reason `loaded` was made sticky in the first place. Instead of unmounting, make
editability follow the flag, through a CodeMirror compartment:

```ts
// CodeEditor.tsx
const editability = useRef(new Compartment()).current;
// in the initial state extensions:
EditorView.editable.of(editable),        // new prop, default true
// and on change:
useEffect(() => {
  view.current?.dispatch({ effects: editability.reconfigure(EditorView.editable.of(editable)) });
}, [editable]);
```

with `CodeEditor editable={loaded}`. `CodePane` keeps rendering the editor, and shows
the existing loading text in the pane header while `!loaded` so the state is visible
rather than silent.

Behaviour this produces:

- A keystroke during the load window is refused by the editor instead of being applied
  to the wrong document and then overwritten.
- Scroll position and cursor survive the switch, so nothing regresses against today.
- The pane header says the document is loading, which today it does not.

## Cost, risk, alternatives

- `EditorView.editable.of(false)` blurs a focused editor. A person typing across a
  switch loses the caret; today they keep it and lose the text instead. Losing the
  caret is the better failure, but it is a visible change and belongs in a test.
- The editor reconfigures per file switch — a dispatch, not a rebuild. No measurable
  cost at the document sizes in the corpus.
- Alternative considered and rejected: queueing keystrokes until the document arrives.
  That has to decide *which* document the keystrokes belong to — the one on screen or
  the one arriving — and answering that wrongly is the same defect with more code.
- Alternative considered and rejected: leaving it to the harness. The harness re-types
  and verifies, so tests stay honest, but the product still loses a person's input in
  the same window.

## Tests to write first

1. `web/src/ui/useCodeSync.test.ts` (unit): `loaded` is `false` for the commit in which
   `documentKey` changes and `true` once the new text is in the machine; `loaded` stays
   `true` when `version` changes for the same path (an external write is not a switch).
2. `web/src/ui/codeview/CodeEditor.test.tsx` (unit): with `editable={false}` the content
   DOM is not editable and a text change is not forwarded to the machine; flipping the
   prop back re-enables typing without remounting the view (assert the same DOM node).
3. `e2e/code-view-load-window.spec.ts` (browser): open a document with a large text,
   switch files, and assert that a keystroke issued immediately after the switch never
   appears in the new document; assert the pane header reports loading while in flight.
   The check must be written so it fails against today's build — the seed harness hides
   the defect, so this spec has to bypass `seedCode` and type raw.

Then the harness can shed its re-type: once the window is closed, the retry in
`e2e/lib/seed.ts` should never fire. Keep it as a canary first (it throws nothing but is
observable in the trace), remove it once a full suite has run for a while without it
triggering.

## Open question for the maintainer

Is losing the caret on a file switch acceptable? If not, the alternative is to keep the
editor editable and, on the machine write that lands across a switch, drop the *incoming*
text when the buffer is dirty and has focus — surfacing a conflict instead of choosing a
side. That is more code and a new kind of interruption; the read-only window is the
smaller promise and fixes the input loss.
