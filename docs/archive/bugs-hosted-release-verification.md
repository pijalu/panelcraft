<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: prove the hosted site runs the revision that passed its checks

Source: `bugs.md`, queued item 11. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §7 and
the closure procedure in §13.

## Observed behaviour

The long-menu and long-filename defects were still visible at
`https://pijalu.github.io/panelcraft/`, and there was no way to tell whether that
meant unfixed application code or a stale deployment. GitHub Pages built and
deployed from a commit that contained the current application changes, the later
documentation-only commit correctly did not trigger the path-filtered workflow,
and the menu and filename fixes were simply still open at the time. The real
defect was methodological: a green deploy job was the only release evidence, and
it says nothing about *which* revision the site is serving or whether that
revision's checks passed.

## Root cause

Four separate gaps, none of them in the application code:

1. **No revision identity in the bundle.** `web/dist` carried hashed asset names
   but nothing that named the commit it came from, so a served page could not be
   matched to a build.
2. **Publication was independent of continuous integration.** The `pages`
   workflow triggered on the same push but ran its own judgement; a red `ci`
   pipeline did not stop a deployment, and nothing tied the uploaded bundle to the
   SHA whose checks ran.
3. **No hosted verification.** Every browser scenario ran against
   `npm run preview` on the built bundle. Nothing exercised the deployed origin,
   its sub-path base, or its service worker.
4. **No first-visit/upgrading separation.** The service worker keeps the running
   editor on its own shell until the user accepts a Restart, so "the site is
   broken" and "this client is on the previous build" looked identical from
   outside — and a hard refresh was being treated as the test.

## Implementation

**Revision identity (`vite.config.ts`).** A build-time plugin stamps the commit
into two places from one `SourceIdentity`: `build-info.json` in the bundle root
(sha, short sha, ref, build time, sha256 of every emitted file) and
`<meta name="panelcraft-build" content="<short sha>">` in `index.html`. The identity
file is written *after* the service worker's precache manifest is computed, so a
file that names the build can never be served from the previous build's cache.

**Deployment evidence (`scripts/hosted-evidence.mjs`).** Downloads the served
`build-info.json` past every cache, checks it names the expected SHA and the same
SHA the freshly rebuilt `web/dist` stamped, reads the identity back out of the
served `index.html`, and re-downloads every asset that page references to compare
sha256 values with the built bundle. It exits non-zero on any mismatch and writes
`deployment-evidence.json` plus `deployment-evidence.md`, which the workflow
attaches to the run. A stale upload fails here even when the identity file itself
is fresh.

**Same-revision publication (`.github/workflows/pages.yml`).** Publication now
hangs off `ci`: the workflow runs on `workflow_run` completion for `main` and only
when that run concluded `successfully`, then checks out
`github.event.workflow_run.head_sha` and refuses to continue if the checked-out
HEAD is not that SHA. Path filtering is preserved by diffing the deployed commit
against its parent (`web/**`, `vite.config.ts`, `package-lock.json`, the workflow
itself), so documentation-only pushes report "nothing to deploy" instead of
publishing. A manual `workflow_dispatch` is still possible and asks the Actions API
whether `ci` succeeded for the dispatched commit before it may publish. The verify
job rebuilds from the same SHA, runs the evidence script and the hosted smoke
suite, writes a summary to the run page and retains the evidence for 90 days.

**Hosted smoke (`playwright.hosted.config.ts`, `e2e-hosted/`).** A separate
configuration with no local web server, two projects and an explicit URL:

- `fresh` boots the deployed app in an empty profile and walks items 7–16: menu
  geometry in a short window and a corner context menu; long file names with
  reachable actions; presentation transport plus the capped camera; the derived
  default flow; the visible default grid and the menu that agrees with it; whole
  route validity against rendered shape boxes; entity labels measured against the
  renderer's own content-box model; a document-carried icon drawn from its
  `data:` bytes; a C4 drill-down with breadcrumbs and the embedded source viewer.
  Every scenario also asserts that no request left the site's own origin and that
  the served identity names the expected revision.
- `upgrading` is the client that already has the service worker installed. It
  installs and takes control, then proves *which bundle is active* by reading the
  `<meta name="panelcraft-build">` value back out of the worker's cached shell and
  comparing it with the deployment's identity — first online, then with the
  network cut, so the answer cannot come from a lucky network response. It also
  requires exactly one `panelcraft-shell-*` cache and no pending update offer.

The update/restart lifecycle (a byte-different worker arrives, the offer waits,
Restart flushes the workspace and reloads once) cannot be staged against Pages
because the deployed worker script is not writable. It stays rehearsed against the
same built bundle by `e2e/ux08-pwa.spec.ts`, which rewrites the served `sw.js` —
the faithful stand-in for a deploy — and is part of the same gate battery.

## Commands and actual output

Local gate battery, run separately on the change:

```
$ npm run build
✓ built in 173ms
$ npm run check          # tsc --noEmit, tsc -p tsconfig.sw.json, eslint
> tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .
(no output — clean)
$ npm test
Test Files  132 passed (132)
     Tests  1492 passed (1492)
$ npm run test:perf
Test Files  2 passed (2)
     Tests  8 passed (8)
$ npx playwright test
199 passed (1.3m)
$ go vet ./...
(no output)
$ staticcheck ./...
(no output)
$ gocognit -over 15 .
19 pdl fromC4Mermaid internal/pdl/mermaid_c4.go:193:1
19 pdl TestSeedsSmoke internal/pdl/seeds_smoke_test.go:11:1
18 main (*canvas).fill scripts/gen-icons.go:65:1
17 pdl fromFlowchartMermaid internal/pdl/mermaid_flow.go:344:1
16 ir IsCanonicalBase64 internal/ir/svg.go:91:1
$ gocyclo -over 12 .
14 pdl scanArrow internal/pdl/lexer.go:170:1
14 ir iconAttrIssues internal/ir/svg.go:291:1
14 ir IsCanonicalBase64 internal/ir/svg.go:91:1
14 main TestRenderChromeSVGAndPNG cmd/panelcraft/render_test.go:57:1
14 main TestConvertMermaidFlowchart cmd/panelcraft/cli_test.go:214:1
13 pdl stepBody internal/pdl/printer.go:163:1
13 pdl styleLines internal/pdl/printer.go:75:1
13 pdl ResolveDrilldown internal/pdl/hierarchy.go:44:1
$ go test -count=1 -race -cover ./...
ok   github.com/pijalu/panelcraft/cmd/panelcraft   3.164s  coverage: 65.9% of statements
ok   github.com/pijalu/panelcraft/internal/corpus   1.274s  coverage: [no statements]
ok   github.com/pijalu/panelcraft/internal/ir       1.265s  coverage: 84.0% of statements
ok   github.com/pijalu/panelcraft/internal/pdl      1.307s  coverage: 76.0% of statements
     github.com/pijalu/panelcraft/internal/render   coverage: 0.0% of statements
ok   github.com/pijalu/panelcraft/internal/server   1.330s  coverage: 91.8% of statements
     github.com/pijalu/panelcraft/web               coverage: 0.0% of statements
$ bash scripts/check-docs.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
$ bash scripts/check-selfcontained.sh web/dist
check-selfcontained: OK — no external-origin resource loads in web/dist
$ go run ./cmd/panelcraft validate docs/architecture
2 files checked, 0 errors, 4 warnings, 0 infos
$ npm run corpus:check
Test Files  1 passed (1)
     Tests  30 passed (30)
$ git diff --check
(no output)
$ bash scripts/check-jargon.sh origin/main
OK — no opaque identifier-only references added since origin/main
```

The Go complexity findings are pre-existing and untouched by this change: no Go
file was modified, and every listed function lives in `internal/pdl`,
`internal/ir`, `cmd/panelcraft` test code or `scripts/gen-icons.go`.

The evidence script, exercised against the freshly built bundle before any
deployment (localhost preview, the only stand-in available offline):

```
$ node scripts/hosted-evidence.mjs --url http://localhost:4173/ \
    --dist web/dist --expect-sha $(git rev-parse HEAD) --out /tmp/ev
- Expected source SHA: f4c48a8c2336997c46adcf0a08b472101a8a2343
- Served source SHA:   f4c48a8c2336997c46adcf0a08b472101a8a2343 (f4c48a8)
- index.html meta identity: f4c48a8
- Assets verified byte-identical: 5/5
**Verdict: PASS**

# and with a deliberately wrong SHA, it must refuse:
$ node scripts/hosted-evidence.mjs --url http://localhost:4173/ --dist web/dist --expect-sha deadbeef
**Verdict: FAIL**
Failures:
- served build sha f4c48a8c… ≠ expected deadbeef
(exit code 1)
```

The hosted smoke suite against the same bundle (13 scenarios: 12 in `fresh`, 1 in
`upgrading`):

```
$ HOSTED_URL=http://localhost:4173/ EXPECTED_BUILD_SHA=$(git rev-parse HEAD) \
    npm run e2e:hosted
13 passed (4.0s)
```

## Deployment evidence (live site)

The change was published through its own new gate, so this release is the gate's
first customer. Merge commit `d3ac0839c96da6df39dd4e45586570b8b93ece64`:

```
$ gh run list --workflow ci     → ci     push         d3ac083  success
$ gh run list --workflow pages  → pages  workflow_run d3ac083  success  (run 43910942763)
```

The Pages run is the `workflow_run` of that `ci` success — it did not deploy on
its own schedule — and its `verify` job reported:

```
- revision: d3ac0839c96da6df39dd4e45586570b8b93ece64
- deployment page: https://pijalu.github.io/panelcraft/
- Assets verified byte-identical: 5/5
Verdict: PASS
```

Checked again from this working tree, independently of the workflow, against the
live origin — rebuilding from the same commit with the Pages base so the
comparison is like for like:

```
$ git checkout main && git rev-parse HEAD
d3ac0839c96da6df39dd4e45586570b8b93ece64
$ npm run build -- --base=/panelcraft/ && node -p "require('./web/dist/build-info.json').sha"
d3ac0839c96da6df39dd4e45586570b8b93ece64
$ node scripts/hosted-evidence.mjs --url https://pijalu.github.io/panelcraft/ \
    --dist web/dist --expect-sha d3ac0839c96da6df39dd4e45586570b8b93ece64 --run 43910942763
- Served source SHA: d3ac0839c96da6df39dd4e45586570b8b93ece64 (d3ac083, main)
- index.html meta identity: d3ac083
- Assets verified byte-identical: 5/5
| assets/index-BBywv01q.js | 2a8a26239ca7400f… | 2a8a26239ca7400f… | yes |
Verdict: PASS
```

Hosted smoke against the deployed site, both projects:

```
$ HOSTED_URL=https://pijalu.github.io/panelcraft/ \
  EXPECTED_BUILD_SHA=d3ac0839c96da6df39dd4e45586570b8b93ece64 npm run e2e:hosted
✓ [fresh] … boot: the served page is the published revision and stays self-contained
✓ [fresh] … item 7 submenu and corner context menu
✓ [fresh] … item 8 long file names
✓ [fresh] … item 9 transport and framing
✓ [fresh] … item 10 derived default flow
✓ [fresh] … item 12 default grid
✓ [fresh] … item 13 routes / item 14 label centring
✓ [fresh] … item 15 project icons / item 16 drill-down and source
✓ [upgrading] … the installed shell is the deployed revision, online and offline
13 passed (4.4s)
```

The hosted run earned its keep immediately: the item 16 scenario failed against
the live site while passing locally, and that failure was real evidence rather
than noise — the seeding helper waited for the new file's tab to be *visible*
instead of *selected*, so the following edit landed in the previous document and
the child diagram opened empty. The screenshot from the failing run showed the
blank child canvas; the helper now waits for `data-active="true"` before typing,
and the same test then passed against the unchanged deployment (`e2e-hosted/` is
not a published path, so fixing a test did not redeploy the site).

## Residual risks

- **One flake, observed once.** The first full `npx playwright test` run on this
  change reported 198/199 with `FLOW-01: canvas-assisted flow editing (dark)`
  failing under full parallel load; the isolated suite passed, the immediate full
  re-run passed 199/199, and `--repeat-each=5` passed 10/10. The archived
  determinism work already removed the races found so far; this one is not
  reproduced and is recorded rather than claimed fixed.
- **The hosted smoke is a smoke suite, not a second full regression run.** It
  asserts one representative behaviour per item against the deployed build (menu
  geometry, file actions, transport plus camera ceiling, derived flow, default
  grid, route avoidance, label centring, icon bytes, drill-down plus source), and
  it does not repeat the theme matrix, accessibility scans or animation-timing
  assertions that the local suite owns. A defect it does not cover can still be
  hidden behind a green hosted run; the local gate remains the place where items
  are proven in depth.
- **Update/restart is rehearsed, not deployed.** Pages cannot be made to serve a
  second worker script, so the restart lifecycle is proven against the same bundle
  locally. The hosted `upgrading` project covers what the deployment *can* prove:
  which bundle the installed worker is serving, online and offline.
- **Deployment evidence is only as good as the origin.** If GitHub Pages served a
  cached copy to the evidence job, the checks would pass against the previous
  revision — which is why the served SHA is compared with the rebuilt bundle's SHA
  and every asset is re-hashed rather than trusted from the identity file.
- **Manual dispatch depends on the Actions API.** The dispatch path asks the API
  for the latest `ci` run of the dispatched commit; if the API is unavailable the
  job fails closed (no publication) rather than open.
