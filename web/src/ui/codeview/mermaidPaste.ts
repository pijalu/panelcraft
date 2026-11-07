// SPDX-License-Identifier: GPL-3.0-only
// Mermaid paste detection (M4-WP6, D-M4-4): a buffer that starts as a
// mermaid flowchart/C4 diagram is converted to canonical PDL on paste, so the
// canvas renders it and the file stays in the one true format (SPEC S2 is
// satisfied at paste-time: the buffer becomes PDL, not mermaid).
import { fromMermaid } from '../../engine/format/mermaid';
import { fromC4 } from '../../engine/format/mermaidC4';
import { printDoc } from '../../engine/format/printer';

const MERMAID_HEADER = /^(flowchart|graph)\b/;
const C4_HEADER = /^C4\w+\b/;

/**
 * Convert mermaid text to canonical PDL; null when the text is not mermaid.
 * C4 diagrams (`C4Context`, `C4Container`, …) route to the C4 converter.
 */
export function mermaidToPdl(text: string): string | null {
  const first = text.trimStart().split('\n')[0]?.trim() ?? '';
  if (MERMAID_HEADER.test(first)) return printDoc(fromMermaid(text).doc);
  if (C4_HEADER.test(first)) return printDoc(fromC4(text).doc);
  return null;
}
