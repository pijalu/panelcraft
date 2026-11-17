// SPDX-License-Identifier: GPL-3.0-only
// One local safe-Markdown subset shared by the presentation panel and the
// Markdown documentation export. It is a typed AST — never HTML — so both
// surfaces apply the same URL policy and the same raw-HTML-as-text rule.
// Constructs: headings, bold, italic, inline code, bullet/numbered lists and
// links. Images, embeds and every other URL scheme are unsupported.
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; code: string }
  | { kind: 'link'; text: string; href: string; external: boolean };

export type Block =
  | { kind: 'heading'; level: number; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] };

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** URL policy: no active/data schemes, no control characters, no network paths. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const value = raw.trim();
  if (value === '' || hasControl(value)) return null;
  if (value.startsWith('//') || value.includes('\\')) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  if (scheme === null) return { href: value, external: false };
  const name = `${scheme[1]!.toLowerCase()}:`;
  if (!SAFE_SCHEMES.has(name)) return null;
  return { href: value, external: name === 'http:' || name === 'https:' };
}

/** Next unescaped occurrence of `marker`, or -1. */
function findUnescaped(text: string, from: number, marker: string): number {
  for (let i = from; i <= text.length - marker.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text.startsWith(marker, i)) return i;
  }
  return -1;
}

/** Closing `)` with balanced nested parentheses; escapes are skipped. */
function linkClose(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

/** Link target: `]` opener followed by a balanced closing `)`. */
function linkParts(text: string, start: number): { label: string; url: string; end: number } | null {
  const open = findUnescaped(text, start + 1, '](');
  if (open < 0) return null;
  const close = linkClose(text, open + 2);
  if (close < 0) return null;
  return { label: text.slice(start + 1, open), url: text.slice(open + 2, close), end: close + 1 };
}

interface Token {
  end: number;
  nodes: Inline[];
}

const textNode = (text: string): Inline[] => (text === '' ? [] : [{ kind: 'text', text }]);

/** `**bold**` and `_italic_` / `*italic*`; the empty body is ordinary text. */
function emphasisAt(text: string, i: number): Token | null {
  const marker = text.startsWith('**', i) ? '**' : (text[i] === '*' || text[i] === '_' ? text[i]! : '');
  if (marker === '') return null;
  const close = findUnescaped(text, i + marker.length, marker);
  if (close <= i + marker.length) return null;
  const children = parseInline(text.slice(i + marker.length, close));
  return {
    end: close + marker.length,
    nodes: [{ kind: marker.length === 2 ? 'strong' : 'em', children }],
  };
}

/** Links and images: unsupported URLs and images become plain text nodes. */
function linkAt(text: string, i: number): Token | null {
  const image = text[i] === '!' && text[i + 1] === '[';
  if (!image && text[i] !== '[') return null;
  const parts = linkParts(text, image ? i + 1 : i);
  if (parts === null) return null;
  if (image) return { end: parts.end, nodes: textNode(text.slice(i, parts.end)) };
  const href = safeHref(parts.url);
  return {
    end: parts.end,
    nodes: href === null
      ? textNode(parts.label)
      : [{ kind: 'link', text: parts.label, href: href.href, external: href.external }],
  };
}

/** One construct at `i`, or null when this character is ordinary text. */
function inlineAt(text: string, i: number): Token | null {
  const ch = text[i]!;
  if (ch === '\\' && i + 1 < text.length) {
    return { end: i + 2, nodes: textNode(text[i + 1]!) };
  }
  if (ch === '`') {
    const close = findUnescaped(text, i + 1, '`');
    if (close >= 0) return { end: close + 1, nodes: [{ kind: 'code', code: text.slice(i + 1, close) }] };
  }
  if (ch === '*' || ch === '_') {
    const emphasis = emphasisAt(text, i);
    if (emphasis !== null) return emphasis;
  }
  return linkAt(text, i);
}

/** One text node per run keeps the AST stable across escape sequences. */
function coalesce(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const last = out.at(-1);
    if (node.kind === 'text' && last?.kind === 'text') last.text += node.text;
    else out.push(node);
  }
  return out;
}

/** Inline AST. Anything unrecognised stays a text node, in source order. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = (): void => {
    out.push(...textNode(plain));
    plain = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const token = inlineAt(text, i);
    if (token === null) { plain += text[i]!; continue; }
    flush();
    out.push(...token.nodes);
    i = token.end - 1;
  }
  flush();
  return coalesce(out);
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+\.\s+/;

type ListBlock = Extract<Block, { kind: 'list' }>;

/** Block AST. Blank lines separate paragraphs; runs of list items form a list. */
export function parseSafeMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: ListBlock | null = null;
  const flushParagraph = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = (): void => {
    if (list !== null) blocks.push(list);
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') { flushParagraph(); flushList(); continue; }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'heading', level: heading[1]!.length, children: parseInline(heading[2]!) });
      continue;
    }
    const item = ITEM.exec(line);
    if (item !== null) {
      flushParagraph();
      const ordered = ORDERED_ITEM.test(line);
      if (list === null || list.ordered !== ordered) { flushList(); list = { kind: 'list', ordered, items: [] }; }
      list.items.push(parseInline(item[1]!));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

const ESCAPED = /[\\`*_[\]()<>|~#]/g;

/** Text is escaped, so raw markup can never become a node in the export. */
function escapeText(text: string): string {
  return text.replace(ESCAPED, (char) => `\\${char}`);
}

function inlineMarkdown(nodes: Inline[]): string {
  return nodes.map((node) => {
    switch (node.kind) {
      case 'text': return escapeText(node.text);
      case 'strong': return `**${inlineMarkdown(node.children)}**`;
      case 'em': return `_${inlineMarkdown(node.children)}_`;
      case 'code': return `\`${node.code}\``;
      case 'link': return `[${inlineMarkdown([{ kind: 'text', text: node.text }])}](${node.href})`;
    }
  }).join('');
}

/**
 * Canonical Markdown from the same AST the renderer uses. `headingOffset`
 * nests the notes under the flow heading (one level for a single flow, two
 * for the all-flows document) without changing the authored source text.
 */
export function serializeSafeMarkdown(blocks: Block[], headingOffset = 0): string {
  if (blocks.length === 0) return '';
  const lines = blocks.map((block) => {
    switch (block.kind) {
      case 'heading': {
        const level = Math.min(6, Math.max(1, block.level + headingOffset));
        return `${'#'.repeat(level)} ${inlineMarkdown(block.children)}`;
      }
      case 'paragraph': return inlineMarkdown(block.children);
      case 'list': return block.items.map((item, i) =>
        `${block.ordered ? `${i + 1}.` : '-'} ${inlineMarkdown(item)}`).join('\n');
    }
  });
  return `${lines.join('\n\n')}\n`;
}
