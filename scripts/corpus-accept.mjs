// SPDX-License-Identifier: GPL-3.0-only
// corpus:accept regenerates golden .pcd/.ir.json corpus files (M1-WP8).
// Stub for M0: corpus infrastructure does not exist yet.
import { fail } from 'node:assert';
import { argv } from 'node:process';

if (argv[1]?.endsWith('corpus-accept.mjs')) {
  console.error('corpus:accept is an M1-WP8 deliverable — not implemented in M0.');
  fail('corpus:accept not implemented (M1-WP8)');
}
