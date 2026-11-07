// SPDX-License-Identifier: GPL-3.0-only
// M0 scaffold: engine/format suites arrive with M1 (parser/printer/converters).
// Kept so vitest discovers a suite per engine package from day one (SPEC §8.2).
import { describe, it, expect } from 'vitest';

describe('engine/format (M0 scaffold)', () => {
  it('scaffold placeholder — replaced by M1-WP2', () => {
    expect(true).toBe(true);
  });
});
