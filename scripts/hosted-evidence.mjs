// SPDX-License-Identifier: GPL-3.0-only
// Deployment evidence for the hosted site (release gate): prove which revision
// GitHub Pages is actually serving, instead of inferring correctness from a green
// deploy job.
//
// What it checks, in order:
//   1. the served `build-info.json` names the revision we meant to publish
//      (`--expect-sha`) and the same one the local build stamped (`--dist`);
//   2. `index.html` carries that identity in `<meta name="panelcraft-build">`,
//      so a browser and the hosted smoke suite can read it without extra calls;
//   3. every asset `index.html` references is byte-identical to the built file —
//      a deploy that uploaded an older bundle fails here even with a fresh SHA in
//      the identity file;
//   4. no asset resolves outside the site origin (self-containment holds on the
//      hosted copy, not only on the local bundle).
//
// Usage:
//   node scripts/hosted-evidence.mjs --url https://pijalu.github.io/panelcraft/ \
//     --dist web/dist --expect-sha <sha> [--run 123456789] [--out test-results/hosted]
//
// Exit code 0 only when every check passes; the JSON + Markdown records are
// written to `--out` so CI can keep them as release evidence.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Parse `--flag value` pairs into a record. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    args[key.slice(2)] = argv[i + 1] ?? '';
  }
  return args;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** Fetch with cache-busting: the evidence must describe the current deployment. */
async function fetchFresh(url) {
  const bust = `${url.includes('?') ? '&' : '?'}evidence=${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await fetch(`${url}${bust}`, { cache: 'no-store', redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return { url: response.url, status: response.status, body: Buffer.from(await response.arrayBuffer()) };
}

/** Asset URLs referenced by index.html, resolved against the served page URL. */
function referencedAssets(html, pageUrl) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const raw = match[1];
    if (raw.startsWith('data:') || raw.startsWith('#')) continue;
    const resolved = new URL(raw, pageUrl);
    if (resolved.origin !== new URL(pageUrl).origin) {
      urls.add(raw);
      continue;
    }
    urls.add(resolved.pathname);
  }
  return [...urls];
}

/** Does a URL path live inside the site's base path (the Pages project scope)? */
function insideScope(path, siteUrl) {
  return path.startsWith(new URL(siteUrl).pathname);
}

/** Compare one served asset against the built copy and report the verdict. */
async function compareAsset(site, base, entry, buildInfo, failures) {
  const url = new URL(entry, base).href;
  if (!insideScope(new URL(url).pathname, site)) return null;
  const served = await fetchFresh(url);
  const path = new URL(served.url).pathname.replace(new URL(site).pathname, '');
  const built = buildInfo.assets[path];
  const hash = sha256(served.body);
  if (built === undefined) {
    failures.push(`${path}: served but not part of the built bundle`);
    return { path, hash, built: null, match: false };
  }
  if (built !== hash) failures.push(`${path}: served hash ${hash.slice(0, 12)} ≠ built ${built.slice(0, 12)}`);
  return { path, hash, built, match: built === hash };
}

/** The whole check, kept linear so a failure names its own reason. */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const site = args.url;
  if (site === undefined) throw new Error('--url is required');
  const base = site.endsWith('/') ? site : `${site}/`;
  const failures = [];

  const servedInfo = JSON.parse((await fetchFresh(new URL('build-info.json', base).href)).body.toString('utf8'));
  if (args['expect-sha'] !== undefined && servedInfo.sha !== args['expect-sha']) {
    failures.push(`served build sha ${servedInfo.sha} ≠ expected ${args['expect-sha']}`);
  }

  const built = args.dist === undefined ? null : JSON.parse(readFileSync(join(args.dist, 'build-info.json'), 'utf8'));
  if (built !== null && built.sha !== servedInfo.sha) {
    failures.push(`served build sha ${servedInfo.sha} ≠ built ${built.sha} (${args.dist})`);
  }
  if (built !== null && JSON.stringify(built.assets) !== JSON.stringify(servedInfo.assets)) {
    failures.push('served asset manifest differs from the built one');
  }

  const index = await fetchFresh(base);
  const html = index.body.toString('utf8');
  const stamped = /<meta name="panelcraft-build" content="([^"]+)"/.exec(html)?.[1];
  if (stamped === undefined) failures.push('index.html has no panelcraft-build meta tag');
  else if (!servedInfo.sha.startsWith(stamped)) {
    failures.push(`index.html reports build ${stamped} but build-info.json names ${servedInfo.sha}`);
  }

  const assets = [];
  for (const entry of referencedAssets(html, index.url)) {
    const compared = await compareAsset(site, index.url, entry, built ?? servedInfo, failures);
    if (compared !== null) assets.push(compared);
  }
  if (assets.length === 0) failures.push('index.html references no same-origin assets');

  const evidence = {
    schema: 1,
    checkedAt: new Date().toISOString(),
    site: base,
    pagesRun: args.run ?? null,
    expectedSha: args['expect-sha'] ?? null,
    served: {
      sha: servedInfo.sha,
      shortSha: servedInfo.shortSha,
      ref: servedInfo.ref,
      builtAt: servedInfo.builtAt,
      indexMeta: stamped ?? null,
      assetCount: Object.keys(servedInfo.assets ?? {}).length,
    },
    assets,
    failures,
    verdict: failures.length === 0 ? 'pass' : 'fail',
  };

  const out = args.out ?? 'test-results/hosted';
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'deployment-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(join(out, 'deployment-evidence.md'), markdown(evidence));

  process.stdout.write(markdown(evidence));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

/** The human-readable half of the evidence (pasted into the archive write-up). */
function markdown(evidence) {
  const lines = [
    '# Hosted deployment evidence',
    '',
    `- Site: ${evidence.site}`,
    `- Checked at: ${evidence.checkedAt}`,
    `- Pages run: ${evidence.pagesRun ?? 'n/a'}`,
    `- Expected source SHA: ${evidence.expectedSha ?? 'n/a'}`,
    `- Served source SHA: ${evidence.served.sha} (${evidence.served.shortSha}, ${evidence.served.ref})`,
    `- Built at: ${evidence.served.builtAt}`,
    `- index.html meta identity: ${evidence.served.indexMeta ?? 'missing'}`,
    `- Assets verified byte-identical: ${evidence.assets.filter((a) => a.match).length}/${evidence.assets.length}`,
    '',
    '| Asset | served sha256 | built sha256 | match |',
    '|---|---|---|---|',
    ...evidence.assets.map(
      (a) => `| ${a.path} | ${a.hash.slice(0, 16)}… | ${(a.built ?? '-').slice(0, 16)}… | ${a.match ? 'yes' : 'no'} |`,
    ),
    '',
    `**Verdict: ${evidence.verdict.toUpperCase()}**`,
    ...(evidence.failures.length === 0 ? [] : ['', 'Failures:', ...evidence.failures.map((f) => `- ${f}`)]),
    '',
  ];
  return lines.join('\n');
}

await main();
