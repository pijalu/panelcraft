// SPDX-License-Identifier: GPL-3.0-only
// WP1 sanity: serializer determinism + key-order stability (M1-WP1).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { serializeDoc } from './serialize';
import { IR_VERSION, type Doc } from './types';

const sample: Doc = {
  irVersion: IR_VERSION,
  formatVersion: '1.0',
  title: 'Checkout',
  level: 'container',
  direction: 'LR',
  theme: 'dark',
  metaComments: ['header note'],
  imports: [{ alias: 'common', path: '../common/actors.pcd', comments: ['#x'], pos: { line: 5, col: 1 } }],
  objects: [
    {
      kind: 'system', id: 'shop', name: 'Webshop', description: 'Storefront SPA',
      technology: 'React', tags: ['core', 'shop'],
      properties: [{ key: 'owner', value: 'team-commerce' }],
      contains: ['api'], attach: 'erp', icon: 'cloud',
      style: { fill: '#2d6cdf', dashed: true, raw: [{ raw: 'custom line', pos: { line: 9, col: 3 } }] },
      attributes: [{ raw: 'experimental "yes"', pos: { line: 10, col: 3 } }],
      comments: ['note'], pos: { line: 7, col: 1 },
    },
    { kind: 'person', id: 'user', pos: { line: 8, col: 1 } },
  ],
  links: [
    {
      id: 'L1', from: 'shop', to: 'api', type: 'requests', label: 'POST /checkout',
      bidir: false, style: { dashed: true }, waypoints: [[120, 300], [0, 0.5]],
      comments: ['flow'], pos: { line: 12, col: 1 },
    },
    { from: 'user', to: 'shop', bidir: true, pos: { line: 13, col: 1 } },
  ],
  flows: [
    {
      id: 'happy', title: 'Happy path', pos: { line: 15, col: 1 },
      steps: [
        { type: 'intro', text: 'Customer buys', pos: { line: 16, col: 3 } },
        { type: 'msg', from: 'user', to: 'shop', label: 'adds to cart', linkRef: 'L1', flip: true, pos: { line: 17, col: 3 } },
        { type: 'process', target: 'api', text: 'Validates', pos: { line: 18, col: 3 } },
        {
          type: 'alt', label: 'payment method', pos: { line: 19, col: 3 },
          branches: [
            { label: 'card', steps: [{ type: 'info', text: 'charge', pos: { line: 20, col: 5 } }], pos: { line: 20, col: 5 } },
            { label: 'invoice', steps: [], pos: { line: 21, col: 5 } },
          ],
        },
        { type: 'par', label: 'fan-out', pos: { line: 22, col: 3 }, lanes: [[{ type: 'conclusion', text: 'done', pos: { line: 23, col: 5 } }], []] },
        { type: 'goto', file: 'refunds.pcd', flow: 'cleanup', ret: 'here', pos: { line: 24, col: 3 } },
      ],
    },
    { title: 'Bare', steps: [], pos: { line: 26, col: 1 } },
  ],
  views: [
    {
      id: 'main', name: 'Main', pos: { line: 28, col: 1 },
      lines: [
        { type: 'layout', mode: 'auto', dir: 'LR', pos: { line: 29, col: 3 } },
        { type: 'hideTag', id: 'external', pos: { line: 30, col: 3 } },
        { type: 'hide', id: 'dagre', pos: { line: 31, col: 3 } },
        { type: 'position', id: 'user', x: 0, y: 120.5, pos: { line: 32, col: 3 } },
        { type: 'pin', id: 'db', pos: { line: 33, col: 3 } },
        { type: 'layout', mode: 'saved', pos: { line: 34, col: 3 } },
      ],
    },
    { name: 'Empty', lines: [], pos: { line: 36, col: 1 } },
  ],
  styles: [{ target: 'api', style: { fill: '#2d6cdf', shape: 'cyl' }, pos: { line: 38, col: 1 } }],
};

describe('serializeDoc (WP1)', () => {
  it('omits empty collections and is deterministic', () => {
    const a = serializeDoc(sample);
    const b = serializeDoc(JSON.parse(JSON.stringify(sample)) as Doc);
    expect(a).toBe(b);
    expect(a).not.toContain('[]');
    expect(a).toContain('"irVersion": 1');
    // x:0 must survive (positional zero is legal)
    expect(a).toContain('"x": 0');
  });

  // Regenerates testdata/ir-fixture.json — the Go-side byte-parity input.
  if (existsSync('testdata')) {
    it('fixture matches committed golden (regen: CORPUS_FIXTURE=1)', () => {
      const json = serializeDoc(sample);
      if (process.env['CORPUS_FIXTURE'] === '1') {
        mkdirSync('testdata', { recursive: true });
        writeFileSync('testdata/ir-fixture.json', json + '\n');
      }
      expect(json + '\n').toBe(readFileSync('testdata/ir-fixture.json', 'utf8'));
    });
  }
});
