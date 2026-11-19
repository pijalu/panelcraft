// SPDX-License-Identifier: GPL-3.0-only
//
// seed.ts — the one way to author a document from a test.
//
// Every scenario that needs a particular diagram does the same thing: click the
// code editor, select all, type the document. Written out by hand that is five
// lines repeated in ~80 specs, and the line that matters is the easiest to drop:
// a click only asks for focus, it does not establish it. When the
// `ControlOrMeta+a` arrives before the editor has focus it selects the page
// instead of the buffer, the previous document survives the insert, and the
// scenario goes on to measure a diagram it never authored. That surfaces much
// later as an unrelated-looking product defect — three separate CI failures came
// from exactly this, each time patched in the one spec that happened to flake.
//
// So the primitive lives here once, and it does three things no call site has to
// remember: require the focus before trusting the chord, wait for the document to
// settle to the expected sync state, and prove the buffer holds the text that was
// typed.
//
//   import { seedCode } from './lib/seed';
//
//   await seedCode(page, DOC);                                    // valid document
//   await seedCode(page, BROKEN, { sync: 'error' });               // diagnostics case
//   await seedCode(page, MERMAID, { sync: 'any', verify: false }); // input that is converted
//
// The caller still owns whether the code panel is open; this only authors.

import { expect, type Page } from '@playwright/test';

/** What the document sync should settle to once the text was typed. */
export type SeedSync = 'clean' | 'error' | 'any';

export interface SeedOptions {
  /** Sync state to wait for. `'any'` skips the wait — for input that is converted. */
  sync?: SeedSync;
  /**
   * Prove the editor holds the text that was typed. A half-applied seed parses
   * into a different diagram, so the scenario would assert against the wrong
   * one; keep this on unless the buffer legitimately differs from the input.
   */
  verify?: boolean;
}

/** The code view's text — i.e. exactly what a save would write. */
export async function documentText(page: Page): Promise<string> {
  return (await page.locator('.cm-content .cm-line').allInnerTexts()).join('\n');
}

/**
 * Line-per-line comparison that ignores the editor's own whitespace noise: the
 * CodeMirror buffer can carry a trailing empty line and zero-width placeholders
 * that are not part of the document a reader sees.
 */
export function normalise(text: string): string {
  return text
    .replace(/\u200b/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .join('\n');
}

/** Select everything in the code view and type `text` over it. */
async function typeDocument(page: Page, text: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  // The click asks for focus; it is not focus. This gate is the whole reason the
  // helper exists — without it the chord sometimes beats the editor.
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

/** Whether the code view holds `text` right now (short poll, boolean answer). */
async function holdsText(page: Page, text: string): Promise<boolean> {
  try {
    await expect
      .poll(() => documentText(page).then(normalise), { timeout: 2_000 })
      .toBe(normalise(text));
    return true;
  } catch {
    return false;
  }
}

/** Replace the open document's text with `text`, and prove that it happened. */
export async function seedCode(page: Page, text: string, options: SeedOptions = {}): Promise<void> {
  const { sync = 'clean', verify = true } = options;
  await typeDocument(page, text);
  if (verify) {
    // The buffer can still come back wrong: an incoming document write can land
    // between the select-all and the insert, and the insert then appends instead
    // of replacing (observed only under CI load, as the previous document with a
    // stray first line appended; the exact interleaving is not pinned, and one
    // frame of the sync machine's diff is enough to collapse the selection).
    // Re-type once into the settled editor rather than reporting it as a product
    // defect; the second attempt must hold, and every assertion after this point
    // runs against a verified document.
    let held = await holdsText(page, text);
    if (!held) {
      await typeDocument(page, text);
      held = await holdsText(page, text);
    }
    if (!held) {
      throw new Error(
        `seedCode: the editor does not hold the seeded document\n--- expected ---\n${normalise(text)}\n--- found ---\n${normalise(await documentText(page))}`,
      );
    }
  }
  if (sync !== 'any') {
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', sync, {
      timeout: 15_000,
    });
  }
}
