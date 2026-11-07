// SPDX-License-Identifier: GPL-3.0-only
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// SPEC §8.1 quality gate: TS eslint complexity ≤12 (error). No per-file
// disables without a `// rationale:` comment + ADR reference (agents.md).
export default tseslint.config(
  {
    ignores: [
      'web/dist/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'e2e/__screenshots__/**',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      complexity: ['error', { max: 12 }],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
