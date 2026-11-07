// SPDX-License-Identifier: GPL-3.0-only
// Visual-diff harness util (SPEC §8.3): pixelmatch @ 0.1 threshold between a
// fresh capture and a committed baseline. Activated by M2 visual specs;
// the util ships now so baselines have a stable comparator from day one.
import { readFileSync, writeFileSync } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  ratio: number; // 0..1
  diffPath?: string;
}

/** Compare two PNG files; optionally write a highlighted diff image. */
export function compareBaselines(
  freshPath: string,
  baselinePath: string,
  opts: { threshold?: number; diffOutPath?: string } = {},
): DiffResult {
  const fresh = PNG.sync.read(readFileSync(freshPath));
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  if (fresh.width !== baseline.width || fresh.height !== baseline.height) {
    throw new Error(
      `size mismatch: fresh ${fresh.width}x${fresh.height} vs baseline ${baseline.width}x${baseline.height}`,
    );
  }
  const diff = new PNG({ width: fresh.width, height: fresh.height });
  const diffPixels = pixelmatch(
    fresh.data,
    baseline.data,
    diff.data,
    fresh.width,
    fresh.height,
    { threshold: opts.threshold ?? 0.1 },
  );
  const totalPixels = fresh.width * fresh.height;
  const result: DiffResult = {
    width: fresh.width,
    height: fresh.height,
    diffPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
  };
  if (opts.diffOutPath !== undefined) {
    writeFileSync(opts.diffOutPath, PNG.sync.write(diff));
    result.diffPath = opts.diffOutPath;
  }
  return result;
}
