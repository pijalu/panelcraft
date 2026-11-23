// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// F-25: laws-of-UX affordances. Pure helpers are tested directly; the components
// are rendered into jsdom with the project's testing-library setup.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { groupKinds, quickAddKey } from './paletteGroups';
import { clockLabel, StatusPill } from './StatusPill';
import { hoverDetail } from './hoverInfo';
import { HoverCard } from './HoverCard';
import { TEMPLATES, EmptyState, galleryVisible, BLANK_TEXT } from './EmptyState';
import type { Kind } from '../engine/model/types';
import { parsePDL } from '../engine/format/parser';
import { buildPlan } from '../engine/flows/plan';
import { derivedFlow, flowsForDisplay } from './flows/derivedFlow';

afterEach(cleanup);

const html = (): string => document.body.innerHTML;

describe('palette grouping (Hick\'s law)', () => {
  it('groups the nine stencils by C4 level, keeping order inside a group', () => {
    const kinds: Kind[] = [
      'person',
      'system',
      'container',
      'datastore',
      'component',
      'note',
      'group',
      'queue',
      'system_ext',
    ];
    const groups = groupKinds(kinds);
    expect(groups.map((g) => g.id)).toEqual(['context', 'container', 'component', 'structural']);
    expect(groups[0]?.kinds).toEqual(['person', 'system', 'system_ext']);
    expect(groups[1]?.kinds).toEqual(['container', 'datastore', 'queue']);
    expect(groups[3]?.kinds).toEqual(['note', 'group']);
  });

  it('keeps quick-add keys aligned with the flat list', () => {
    expect(quickAddKey(['person', 'system'], 'system')).toBe(2);
    expect(quickAddKey(['person'], 'note')).toBe(0);
  });
});

describe('saved/dirty pill (visibility of system status)', () => {
  it('formats a clock label in local time', () => {
    const at = new Date(2026, 0, 2, 14, 5, 0).getTime();
    expect(clockLabel(at, () => at + 1000)).toBe('14:05');
    expect(clockLabel(null)).toBeNull();
    expect(clockLabel(0)).toBeNull();
  });

  it('says Saved with the time, Unsaved when dirty, and counts problems', () => {
    const at = new Date(2026, 0, 2, 9, 7, 0).getTime();
    render(<StatusPill dirty={false} savedAt={at} problems={0} now={() => at} />);
    expect(screen.getByTestId('status-pill').textContent).toContain('Saved · 09:07');
    expect(screen.getByTestId('status-pill').getAttribute('data-dirty')).toBe('false');
    cleanup();

    render(<StatusPill dirty savedAt={at} problems={2} now={() => at} />);
    expect(screen.getByTestId('status-pill').textContent).toContain('Unsaved');
    expect(screen.getByTestId('problem-chip').textContent).toContain('2 problems');
  });
});

describe('hover info card (working memory)', () => {
  it('summarises technology, description and tags', () => {
    expect(
      hoverDetail({ id: 'a', kind: 'system', name: 'A', technology: 'Go', description: 'API edge', tags: ['core'] }),
    ).toBe('Go · API edge · #core');
    expect(hoverDetail({ id: 'a', kind: 'system', name: 'A' })).toBeNull();
  });

  it('renders nothing when nothing is hovered', () => {
    render(<HoverCard info={null} />);
    expect(screen.queryByTestId('hover-card')).toBeNull();
    cleanup();
    render(<HoverCard info={{ id: 'a', kind: 'system_ext', name: 'Payments', technology: 'Stripe' }} />);
    const card = screen.getByTestId('hover-card');
    expect(card.textContent).toContain('Payments');
    expect(card.textContent).toContain('system ext');
    expect(card.textContent).toContain('Stripe');
  });
});

describe('template gallery (paradox of the active user)', () => {
  it('offers three starting points that actually parse', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['c4', 'flow', 'mermaid']);
    for (const t of TEMPLATES) {
      expect(t.text.startsWith('pcd 1.0')).toBe(true);
      // Regression guard: a template that does not parse would hand the user a
      // broken document (caught in F-25 verification: link labels are `: "x"`,
      // `tag` is singular, flows are `flow "Name" as id`).
      const parsed = parsePDL(t.text);
      expect(parsed.doc, `${t.id}: ${parsed.diagnostics.map((d) => d.message).join('; ')}`).not.toBeNull();
    }
  });

  it('starts every template with only Default steps from its drawn connectors', () => {
    const expected: Record<string, string[]> = {
      c4: ['buys', 'charges'],
      flow: ['POST /checkout', '201 Created'],
      mermaid: ['Service A → Service B'],
    };
    for (const template of TEMPLATES) {
      const { doc } = parsePDL(template.text);
      if (doc === null) throw new Error(`${template.id} does not parse`);
      expect(flowsForDisplay(doc).map((flow) => flow.title), template.id).toEqual(['Default flow']);
      const flow = derivedFlow(doc);
      if (flow === null) throw new Error(`${template.id} has no Default flow`);
      expect(buildPlan({ doc, flow }).beats.map((beat) => beat.title), template.id).toEqual(
        expected[template.id] ?? [],
      );
    }
    const blank = parsePDL(BLANK_TEXT).doc;
    expect(derivedFlow(blank)?.steps).toEqual([]);
  });

  it('describes the C4 template’s two drawn links accurately', () => {
    render(<EmptyState onInsert={() => {}} onBlank={() => {}} />);
    expect(screen.getByTestId('template-c4').textContent).toContain('two links');
  });

  it('renders one button per template', () => {
    render(<EmptyState onInsert={() => {}} onBlank={() => {}} />);
    for (const t of TEMPLATES) expect(screen.getByTestId(`template-${t.id}`)).toBeTruthy();
    expect(html()).toContain('Start from a template');
  });

  it('offers a blank document first and inserts nothing', () => {
    const inserted: string[] = [];
    let blank = 0;
    render(<EmptyState onInsert={(t) => inserted.push(t.id)} onBlank={() => { blank += 1; }} />);
    const cards = [...document.querySelectorAll('.empty-card')];
    expect(cards[0]?.getAttribute('data-testid')).toBe('template-blank');
    fireEvent.click(screen.getByTestId('template-blank'));
    expect(blank).toBe(1);
    // Blank means "insert nothing": no template text may be seeded.
    expect(inserted).toEqual([]);
  });

  it('seeds a valid empty document, not a template', () => {
    const parsed = parsePDL(BLANK_TEXT);
    expect(parsed.doc, parsed.diagnostics.map((d) => d.message).join('; ')).not.toBeNull();
    expect(parsed.doc?.objects ?? []).toEqual([]);
    expect(parsed.doc?.links ?? []).toEqual([]);
    expect(parsed.doc?.flows ?? []).toEqual([]);
  });

  it('shows the gallery only when a file has no objects and no authored line', () => {
    expect(galleryVisible(0, '')).toBe(true);
    expect(galleryVisible(0, '   \n')).toBe(true);
    // Opening an empty file already fills the code view with the canvas
    // projection of a blank document — still unanswered, still offered.
    expect(galleryVisible(0, BLANK_TEXT)).toBe(true);
    expect(galleryVisible(0, 'pcd 1.0\n')).toBe(true);
    expect(galleryVisible(0, 'pcd 1.0\nsystem a "A"\n')).toBe(false);
    expect(galleryVisible(2, '')).toBe(false);
  });
});
