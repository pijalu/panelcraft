// SPDX-License-Identifier: GPL-3.0-only
// corpus:accept regenerates the corpus goldens (M1-WP8). The TS engine is the
// reference, so generation runs through vitest (CORPUS_FIXTURE=1 mode of
// web/src/engine/format/corpus.test.ts) — plain node cannot import the TS
// sources. Never hand-edit testdata/corpus/** artifacts; rerun this instead.
// Go replays the same goldens byte-for-byte (internal/corpus) — parity gate.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { argv } from 'node:process';

const bin = join(process.cwd(), 'node_modules', '.bin', 'vitest');

if (argv[1]?.endsWith('corpus-accept.mjs')) {
  const res = spawnSync(bin, ['run', 'web/src/engine/format/corpus.test.ts'], {
    stdio: 'inherit',
    env: { ...process.env, CORPUS_FIXTURE: '1' },
  });
  process.exit(res.status ?? 1);
}
