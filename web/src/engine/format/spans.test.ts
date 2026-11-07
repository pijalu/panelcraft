// SPDX-License-Identifier: GPL-3.0-only
// F-22 statement spans: the canvas ↔ code map needs the source lines of an
// entity, and the reverse lookup (line → object) for caret-driven selection.

import { describe, expect, it } from 'vitest';
import { objectAtLine, spanOf } from './spans';

const TEXT = `pcd 1.0

system api "API" {
  description "edge"
  tag core
}

datastore db "DB"

api -> db as L1 {
  waypoint (10, 20)
}

flow "F" as f1 {
  intro "x"
}
`;

describe('spanOf (F-22)', () => {
  it('covers the whole statement, including its block', () => {
    expect(spanOf(TEXT, 'api')).toEqual({ from: 3, to: 6 });
    expect(spanOf(TEXT, 'db')).toEqual({ from: 8, to: 8 });
    expect(spanOf(TEXT, 'L1')).toEqual({ from: 10, to: 12 });
    expect(spanOf(TEXT, 'f1')).toEqual({ from: 14, to: 16 });
  });

  it('returns null for unknown ids and unparsable text', () => {
    expect(spanOf(TEXT, 'nope')).toBeNull();
    expect(spanOf('pcd 1.0\nsystem', 'api')).toBeNull();
  });
});

describe('objectAtLine (F-22)', () => {
  it('maps any line of a statement to its object', () => {
    expect(objectAtLine(TEXT, 3)).toBe('api');
    expect(objectAtLine(TEXT, 5)).toBe('api'); // inside the block
    expect(objectAtLine(TEXT, 8)).toBe('db');
  });

  it('returns null outside object statements', () => {
    expect(objectAtLine(TEXT, 1)).toBeNull(); // magic line
    expect(objectAtLine(TEXT, 11)).toBeNull(); // link block
  });
});
