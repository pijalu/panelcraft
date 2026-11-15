# BUG-08 — undo from the History dialog could revert far more than the last edit

**Status:** fixed and verified.

## Observed

`e2e/cx04-connector-style.spec.ts` went red on the shared 2-core CI runner and
stayed green locally (60+ local runs, including CPU throttling, 8 parallel
workers and background CPU starvation). After "set width 2.5 → ArrowRight on the
Line radio group → History → Undo", the panel's Line group never returned to
`solid` within 15 s, so the assertion

    await expect.poll(() => checked(page, 'link-line'), { timeout: 15_000 }).toEqual(['solid']);

could not become true, and the failure was a bare timeout with no state in it.

## What the investigation established

1. **Routing was correct.** Instrumenting `useHistory.undo` showed the undo went
   to the canvas surface with the last journal row being the link edit. The code
   surface was not involved, so "undo reverted the wrong surface" was wrong.
2. **The app repaints on undo.** `CanvasController.undoCommand()`/`redoCommand()`
   repainted but never published a snapshot, so panels reading the selection
   from `onState` kept pre-undo values. Fixed separately (RED-first unit test in
   `CanvasController.test.ts`), and it was not the whole story.
3. **Undo depth is runner-dependent.** Same-link property edits coalesce into one
   undo entry inside a one-second window (`COALESCE_WINDOW_MS`,
   `web/src/workspace/undo.ts`). The test made eleven property picks on one link
   and then asserted that a single undo restores the style. On a fast run those
   picks merge into one entry and the undo restores the style; on a slow run they
   stay separate, the undo pops only the newest entry, and the style legitimately
   stays `dashed`. The keyboard step makes this sharper: pressing ArrowRight on a
   radio whose group already holds that value changes nothing, so it creates no
   entry at all.

## Fix

The contract the brief promises — "undo restores the previous style, redo
reapplies it" — is unchanged and still asserted. What changed is the state the
assertion runs against: it now runs after the reload section, on a session whose
canvas journal holds exactly the one style change that section creates.

    await page.getByTestId('link-line-solid').click();
    await expect(page.locator('.cm-content')).not.toContainText('line dashed', …);
    await settle(page);
    await chooseAppMenu(page, 'history-open');
    await page.getByTestId('history-undo').click();
    await expect.poll(() => checked(page, 'link-line'), …).toEqual(['dashed']);
    await page.getByTestId('history-redo').click();
    await expect.poll(() => checked(page, 'link-line'), …).toEqual(['solid']);

No timeout was extended to hide a hang, no retry was added, and no assertion was
dropped: the file now also asserts the document text in both directions, which
the earlier version did not.

## Verification

- `npx playwright test e2e/cx04-connector-style.spec.ts --repeat-each=4` → 8
  passed, repeated runs stable.
- Full suite on CI: green (run 43764859446), and locally 155 passed.
- The diagnostic value of a red run is retained: Playwright keeps traces on
  failure and CI now uploads `test-results/` when the e2e job fails.

## Correction to the earlier write-up

An earlier revision of this entry stated the document collapsed to `pcd 1.0`,
i.e. that a *code* undo had run. That observation came from a debug spec that
did not mirror the real sequence, and it did not reproduce once the panel-repaint
fix landed. It is recorded here because the wrong diagnosis is what led to the
first two fix attempts.
