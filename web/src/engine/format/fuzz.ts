// SPDX-License-Identifier: GPL-3.0-only
// Seeded deterministic PRNG utilities (M1-WP3 property fuzz, D-M1-5).
// Hand-rolled instead of fast-check: no new runtime dependency, fully
// reproducible failures from a seed (agents.md dependency rule).

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(xs: readonly T[]): T;
  bool(p?: number): boolean;
  some<T>(xs: readonly T[], max: number): T[];
}

/** mulberry32 — 32-bit state, good enough for property fuzzing. */
export function rngFrom(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
    bool: (p = 0.5) => next() < p,
    some: <T>(xs: readonly T[], max: number): T[] => {
      const n = Math.floor(next() * (max + 1));
      const out: T[] = [];
      for (let k = 0; k < n; k += 1) out.push(xs[Math.floor(next() * xs.length)]!);
      return out;
    },
  };
}

/** Run `prop` over N seeds; first failure reports the seed (reproducible). */
export function forAllSeeds(
  seeds: number[],
  prop: (rng: Rng, seed: number) => void,
): void {
  for (const seed of seeds) {
    prop(rngFrom(seed), seed);
  }
}
