// SPDX-License-Identifier: GPL-3.0-only
// The safe subset used by both the presentation panel and documentation export.
// No HTML parser, no sanitizer library, no network: only the constructs below
// become nodes; everything else stays text.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { SafeMarkdown } from '../../ui/flows/SafeMarkdown';
import { parseSafeMarkdown, safeHref, serializeSafeMarkdown } from './safeMarkdown';
import type { Block } from './safeMarkdown';

describe('safe URL policy', () => {
  it('allows http(s), mailto and relative links', () => {
    expect(safeHref('https://example.test/a?b=1#c')).toEqual({ href: 'https://example.test/a?b=1#c', external: true });
    expect(safeHref('http://example.test/')).toEqual({ href: 'http://example.test/', external: true });
    expect(safeHref('mailto:ada@example.test')).toEqual({ href: 'mailto:ada@example.test', external: false });
    expect(safeHref('docs/notes.md')).toEqual({ href: 'docs/notes.md', external: false });
    expect(safeHref('/local/page')).toEqual({ href: '/local/page', external: false });
    expect(safeHref('#section')).toEqual({ href: '#section', external: false });
  });

  it('rejects active, data, unknown and obfuscated schemes', () => {
    for (const raw of [
      'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)',
      'data:text/html,<script>x</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd',
      'ftp://example.test/a', 'java\nscript:alert(1)', 'java\tscript:alert(1)',
      '//example.test/a', '\\\\example.test\\a', '', '   ',
    ]) {
      expect(safeHref(raw), raw).toBeNull();
    }
  });
});

describe('safe Markdown AST', () => {
  it('parses headings, paragraphs, bullet and numbered lists', () => {
    expect(parseSafeMarkdown('# Title\n\nSome prose\ncontinued here\n\n- one\n- two\n\n1. first\n2. second\n')).toEqual([
      { kind: 'heading', level: 1, children: [{ kind: 'text', text: 'Title' }] },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'Some prose continued here' }] },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'one' }], [{ kind: 'text', text: 'two' }]] },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'first' }], [{ kind: 'text', text: 'second' }]] },
    ]);
  });

  it('nests bold, italic, code and links inside list items', () => {
    const ast = parseSafeMarkdown('- **bold _italic_** and `a(b)` and [docs](https://example.test/a)\n');
    expect(ast).toEqual([
      {
        kind: 'list', ordered: false, items: [[
          { kind: 'strong', children: [
            { kind: 'text', text: 'bold ' },
            { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
          ] },
          { kind: 'text', text: ' and ' },
          { kind: 'code', code: 'a(b)' },
          { kind: 'text', text: ' and ' },
          { kind: 'link', text: 'docs', href: 'https://example.test/a', external: true },
        ]],
      },
    ]);
  });

  it('keeps raw HTML, images and unsafe links as text', () => {
    const ast = parseSafeMarkdown('<b>bold</b> ![alt](https://example.test/a.png) [x](javascript:alert(1)) [y](data:text/html,x)');
    expect(JSON.stringify(ast)).not.toContain('"kind":"link"');
    expect(serializeSafeMarkdown(ast, 0)).toContain('\\<b\\>bold\\</b\\> !\\[alt\\]\\(https://example.test/a.png\\)');
    expect(serializeSafeMarkdown(ast, 0)).toContain('x y');
    expect(serializeSafeMarkdown(ast, 0)).not.toContain('javascript:');
    expect(serializeSafeMarkdown(ast, 0)).not.toContain('data:');
    expect(JSON.stringify(ast)).not.toContain('href');
  });

  it('honours backslash escapes instead of interpreting markup', () => {
    const ast = parseSafeMarkdown('\\*not a list\\* and \\# not a heading');
    expect(ast).toEqual([{ kind: 'paragraph', children: [{ kind: 'text', text: '*not a list* and # not a heading' }] }]);
  });

  it('returns no blocks for empty text and skips blank lines', () => {
    expect(parseSafeMarkdown('')).toEqual([]);
    expect(parseSafeMarkdown('\n\n  \n')).toEqual([]);
  });

  it('round-trips supported structure through the shared serializer', () => {
    const source = '# Title\n\n**bold** and _italic_ with `code` and [link](https://example.test/)\n\n- a\n- b\n\n1. x\n2. y\n';
    expect(serializeSafeMarkdown(parseSafeMarkdown(source), 0)).toBe(source);
  });

  it('nests exported headings under the flow heading level', () => {
    const ast: Block[] = [{ kind: 'heading', level: 1, children: [{ kind: 'text', text: 'Notes' }] }];
    expect(serializeSafeMarkdown(ast, 1)).toBe('## Notes\n');
    expect(serializeSafeMarkdown(ast, 2)).toBe('### Notes\n');
  });
});

describe('SafeMarkdown renderer', () => {
  it('renders DOM nodes, never innerHTML, with safe link behaviour', () => {
    const { container } = render(
      <SafeMarkdown blocks={parseSafeMarkdown('# Hi\n\n**bold** [site](https://example.test/) [bad](javascript:alert(1)) <b>x</b>\n\n- one\n\n2. two\n')} />,
    );
    expect(container.querySelector('h3')?.textContent).toBe('Hi');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(screen.getByText('site').getAttribute('href')).toBe('https://example.test/');
    expect(screen.getByText('site').getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('site').getAttribute('target')).toBe('_blank');
    expect(screen.queryByText('bad')).toBeNull();
    expect(container.textContent).toContain('<b>x</b>');
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelectorAll('ul li')).toHaveLength(1);
    expect(container.querySelectorAll('ol li')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('emits nothing for empty text', () => {
    const { container } = render(<SafeMarkdown blocks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nested emphasis as nested elements', () => {
    const { container } = render(<SafeMarkdown blocks={parseSafeMarkdown('**a _b_**')} />);
    expect(container.querySelector('strong em')?.textContent).toBe('b');
  });
});
