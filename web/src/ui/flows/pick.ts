// SPDX-License-Identifier: GPL-3.0-only
// Optional props with one meaning: a key whose value is `undefined` is absent.
// Under `exactOptionalPropertyTypes` a spread object cannot carry an explicit
// `undefined`, so every conditional prop would otherwise need its own branch.
export function pick<T extends object>(entries: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
