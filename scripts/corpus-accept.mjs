// SPDX-License-Identifier: GPL-3.0-only
// corpus:accept regenerates the corpus goldens (M1-WP8, M4-WP5). The TS engine
// is the reference, so generation runs through vitest — plain node cannot
// import the TS sources. Never hand-edit testdata/corpus/** artifacts; rerun
// this instead. Go replays the parse goldens byte-for-byte (internal/corpus)
// — parity gate. Export goldens (export.mmd, M4-WP5) are TS-only: the Go
// replay job has no converters (corpus.test.ts layout note). Sequence export
// goldens (export.<flow>.seq.mmd, M6-WP7) are TS-only for the same reason.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { argv } from 'node:process';

const bin = join(process.cwd(), 'node_modules', '.bin', 'vitest');

if (argv[1]?.endsWith('corpus-accept.mjs')) {
  const res = spawnSync(
    bin,
    [
      'run',
      'web/src/engine/format/corpus.test.ts',
      'web/src/engine/format/mermaidExport.test.ts',
      'web/src/engine/format/mermaidSequenceExport.test.ts',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, CORPUS_FIXTURE: '1', EXPORT_FIXTURE: '1' },
    },
  );
  process.exit(res.status ?? 1);
}
