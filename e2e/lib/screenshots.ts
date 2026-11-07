// SPDX-License-Identifier: GPL-3.0-only
// Screenshot policy (F-09, review §7): e2e runs must never dirty the worktree.
//
// - Every capture goes to `test-results/screenshots/` (gitignored artifact) —
//   the run always produces evidence, even on CI.
// - A curated capture is additionally copied into `e2e/goldens/` (tracked,
//   reviewable) *only* when `UPDATE_GOLDENS=1`, so refreshing the visual record
//   is an explicit, reviewable commit instead of a side effect of `npm run e2e`.
//
// Curated goldens live in `e2e/goldens/` and are compared by e2e/lib/visual.ts.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';

const ARTIFACT_DIR = 'test-results/screenshots';
const GOLDEN_DIR = 'e2e/goldens';

export interface CaptureOptions {
  /** Skip the golden copy even with UPDATE_GOLDENS=1 (ad-hoc diagnostics). */
  golden?: boolean;
  fullPage?: boolean;
}

/** Screenshot `page` as `name`, writing an artifact and (opt-in) a golden. */
export async function capture(page: Page, name: string, opts: CaptureOptions = {}): Promise<string> {
  const file = `${name}.png`;
  const artifact = join(ARTIFACT_DIR, file);
  mkdirSync(dirname(artifact), { recursive: true });
  await page.screenshot({ path: artifact, fullPage: opts.fullPage ?? true });
  if (process.env.UPDATE_GOLDENS === '1' && opts.golden !== false) {
    const golden = join(GOLDEN_DIR, file);
    mkdirSync(dirname(golden), { recursive: true });
    copyFileSync(artifact, golden);
    return golden;
  }
  return artifact;
}

/** Path of a curated golden (visual-diff comparisons read this). */
export function goldenPath(name: string): string {
  return join(GOLDEN_DIR, `${name}.png`);
}
