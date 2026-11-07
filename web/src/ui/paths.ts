// SPDX-License-Identifier: GPL-3.0-only
/** Path display helpers shared by workspace chrome. */
export function baseName(p: string): string {
  return p.split('/').pop() ?? p;
}

/** Path without its extension ('a/b.pcd' → 'b'). */
export function stem(p: string): string {
  return baseName(p).replace(/\.[^.]*$/, '');
}
