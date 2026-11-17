// SPDX-License-Identifier: GPL-3.0-only
// Presentation renderer for the shared safe-Markdown AST. Preact text/nodes
// only — no dangerouslySetInnerHTML, no HTML parsing, no remote resources.
import { s } from '../strings';
import type { Block, Inline } from '../../engine/format/safeMarkdown';

const inlineNode = (node: Inline, key: number) => {
  switch (node.kind) {
    case 'text': return node.text;
    case 'strong': return <strong key={key}>{node.children.map(inlineNode)}</strong>;
    case 'em': return <em key={key}>{node.children.map(inlineNode)}</em>;
    case 'code': return <code key={key}>{node.code}</code>;
    case 'link': return (
      <a
        key={key}
        href={node.href}
        target={node.external ? '_blank' : undefined}
        rel={node.external ? 'noopener noreferrer' : undefined}
      >
        {node.text}
      </a>
    );
  }
};

const blockNode = (block: Block, key: number) => {
  switch (block.kind) {
    case 'heading': {
      const Level = `h${Math.min(6, block.level + 2)}` as 'h3' | 'h4' | 'h5' | 'h6';
      return <Level key={key}>{block.children.map(inlineNode)}</Level>;
    }
    case 'paragraph': return <p key={key}>{block.children.map(inlineNode)}</p>;
    case 'list': {
      const items = block.items.map((item, i) => <li key={i}>{item.map(inlineNode)}</li>);
      return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
  }
};

export function SafeMarkdown({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) return null;
  return <div class="pc-md">{blocks.map(blockNode)}</div>;
}

/** Accessible name of the notes region; one catalog entry, no markup. */
export const NOTES_LABEL = s('Flow notes');
