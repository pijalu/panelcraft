// SPDX-License-Identifier: GPL-3.0-only
// Coverage thresholds enforce SPEC §8.2: core packages (engine, workspace) ≥80%
// lines/statements/functions (branches 60%). ui/* ≥60% is REPORTED, not gated.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // jsdom-only stubs (CodeMirror measures via Range.getClientRects, which
    // jsdom lacks — the uncaught rAF exception poisoned full runs randomly).
    setupFiles: ['web/src/test/setup.dom.ts'],
    include: ['web/src/**/*.test.ts', 'web/src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['web/src/**/*.ts', 'web/src/**/*.tsx'],
      exclude: [
        'web/src/main.tsx',
        'web/src/**/*.test.ts',
        'web/src/**/*.test.tsx',
        'web/src/**/*.d.ts',
        // Test-only helpers (fake file handles, DOM setup) are not shipped code.
        'web/src/test/**',
      ],
      thresholds: {
        'web/src/engine/**': { lines: 80, functions: 80, statements: 80, branches: 60 },
        'web/src/workspace/**': { lines: 80, functions: 80, statements: 80, branches: 60 },
      },
    },
  },
});
