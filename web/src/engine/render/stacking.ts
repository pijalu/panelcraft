// SPDX-License-Identifier: GPL-3.0-only
// CX-03: stable paint/hit-test order. Auto is effective z=0; source arrays
// remain in document order so unrelated canvas edits never reorder PDL.

/** Bottom-to-top object projection with stable document-order ties. */
export function stackObjects<T extends { z?: number }>(objects: T[]): T[] {
  if (objects.every((object) => object.z === undefined)) return objects;
  return objects
    .map((object, index) => ({ object, index }))
    .sort((a, b) => (a.object.z ?? 0) - (b.object.z ?? 0) || a.index - b.index)
    .map(({ object }) => object);
}
