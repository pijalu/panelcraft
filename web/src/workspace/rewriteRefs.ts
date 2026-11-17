// SPDX-License-Identifier: GPL-3.0-only
// Reference maintenance for decomposition links (IR v10, FILE-FORMAT.md §3.2): when a
// diagram is renamed or moved, every `drilldown "<path>"` that pointed at it is
// rewritten in the same step, so a rename never silently breaks the hierarchy.
//
// Line-based on purpose: the printer's canonical form would reflow unrelated lines
// of the author's file, and only the quoted path of a `drilldown` line may change.
/** Quote a path with the format's two string escapes (FILE-FORMAT §1). */
const quotePath = (path: string): string => path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Directory part of a workspace path ('' for a root file). */
export function dirOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/**
 * Workspace-relative path from the directory of `fromFile` to `target`: the
 * spelling a `drilldown` line uses (§3.2 — resolved from the declaring file).
 */
export function relativePath(fromFile: string, target: string): string {
  const fromParts = dirOf(fromFile).split('/').filter((p) => p !== '');
  const toParts = target.split('/').filter((p) => p !== '');
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const up = fromParts.length - shared;
  const rest = toParts.slice(shared).join('/');
  return up === 0 ? rest : `${'../'.repeat(up)}${rest}`;
}

interface Rewrite {
  path: string;
  text: string;
  changed: boolean;
}

const DRILL_LINE = /^(\s*drilldown(?:\s+embedded)?\s+")((?:[^"\\]|\\.)*)(".*)$/;
const unescape = (raw: string): string => raw.replace(/\\(["\\])/g, '$1');

/** One file's text with its drill-down targets re-pointed at `to`. */
function rewriteText(path: string, text: string, from: string, to: string): Rewrite {
  let changed = false;
  const lines = text.split('\n').map((line) => {
    const match = DRILL_LINE.exec(line);
    if (match === null) return line;
    const target = unescape(match[2] ?? '');
    // Only a target that resolves to the renamed path is touched; an escaping or
    // foreign path is left exactly as authored.
    if (relativePath(path, from) !== target) return line;
    changed = true;
    return `${match[1] ?? ''}${quotePath(relativePath(path, to))}${match[3] ?? ''}`;
  });
  return { path, text: lines.join('\n'), changed };
}

/**
 * Rewrite every drill-down reference to `from` in `files`, so renaming or moving a
 * diagram keeps the hierarchy intact. Files without a reference are returned
 * unchanged (`changed: false`) and must not be written.
 */
export function rewriteDrilldownPaths(
  files: readonly { path: string; text: string }[],
  from: string,
  to: string,
): Rewrite[] {
  return files.map((file) => rewriteText(file.path, file.text, from, to));
}
