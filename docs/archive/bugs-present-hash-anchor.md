<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: dedicated presentation URL anchor

Source: `bugs.md`, "Dedicated presentation URL anchor".
Plan: the four steps in that section and section 4 of
`docs/BUGS-RESOLUTION-PLAN-ROUND-2.md`. Scenarios: `e2e/present-hash-anchor.spec.ts`.

## What was reported

The presentation shell had no relationship with the address bar. `#present=`
did not exist, and a flow id on its own was not a shareable address: workspace
documents live only in this browser's storage and the active file is restored
locally. The fix had to add a link without making the hash a second source of
document truth.

## The URL contract

The codec in `web/src/ui/presentAnchor.ts` writes
`#present=<encodeURIComponent(flow-id)>`. Reading accepts only that exact form:
one key, no raw `=`/`&`/`#`/spaces, a valid UTF-8 percent sequence, a
non-whitespace id of at most 256 characters and no control characters. Anything
else is null. A foreign fragment such as `#view=main` is not ours and is left
untouched — no view anchor was introduced.

Only an **authored** flow id is linkable. A title or a derived default flow
still presents from the launcher, but no hash is published and no hash can
start it.

| Event | Condition | Effect |
|---|---|---|
| direct load / reload | valid authored id in the restored file | start that flow; no history write |
| direct load / reload | unknown or malformed `#present=` value | `replace('')`; nothing starts |
| explicit Present | authored id | `push` the anchor (Back returns to the editor) |
| explicit Present | no authored id | present locally, no history write |
| browser Back | anchor removed | exit the presentation; no write (URL already clear) |
| browser Forward | valid anchor | start that flow again; no write |
| repeated hash event | same id already running | no-op (no feedback loop) |
| natural end / explicit Exit | our anchor present | `replace('')`, no extra entry |
| external file switch | idle and our anchor present | `replace('')` (a stale link cannot outlive its file) |
| cross-file `goto` | file changes while playing | keep the anchor: the presentation is still running |

Status is marked playing at adoption and at explicit Present, so an immediate
Back is recognised even before the runner publishes its first status event.
Writes use `pushState`/`replaceState`, which are silent in a browser; the
duplicate `hashchange` + `popstate` pair from one user navigation is collapsed
in the narrow History port. `FlowRunner` remains URL-agnostic: it publishes the
authored id as a fact, and the shell alone owns the policy.

## Regression evidence — failed before the fix (RED)

Codec and transition-table suite, run before `presentAnchor.ts` existed:

```
npx vitest run web/src/ui/presentAnchor.test.ts --reporter=dot
Error: Cannot find module './presentAnchor' imported from
/Users/muaddib/dev/panelcraft/web/src/ui/presentAnchor.test.ts
Test Files  1 failed (1)     Tests  no tests
```

That suite now contains 15 cases covering the round-trip and malformed values,
direct load, reload, Back/Forward, Present, natural end, exit, both file-switch
kinds, unknown ids, and the immediate-Back race.

## Defect found during browser testing

The first full run passed; a second run failed on Back/Forward. Console tracing
of the transition table (removed afterwards) showed the cause: after a reload,
`ready` adopted the flow and called `startFlow`, but the player's `playing`
status arrived a tick later. An immediate Back was therefore read while the
table still reported `idle` and was ignored; Forward then deduplicated against
the still-running flow. Observed trace before the fix:

```
ready    -> start checkout, state.status = idle
hash ''  -> effects {}            (Back ignored)
status   -> playing               (too late)
```

Fix: set `status: 'playing'` in the adoption and explicit-Present transitions,
and treat the no-anchor branch as idle. A dedicated unit case
("Back immediately after a hash-originated start still exits") now fixes the
race in the table. The browser run that previously failed then passed:

```
npx playwright test e2e/present-hash-anchor.spec.ts --workers=1
4 passed (7.9s)
```

## Verification evidence — passed after the fix (GREEN)

- Pure codec and transition table:
  `npx vitest run web/src/ui/presentAnchor.test.ts --reporter=dot`
  → **1 file, 15 tests passed**.
- Full unit suite: `npm test` → **136 files, 1535 tests passed**, coverage gates
  green.
- Static gates: `npm run check` → exit 0 (TypeScript, service worker, ESLint
  complexity and line limits).
- Focused browser run after `npm run build`:
  `npx playwright test e2e/present-hash-anchor.spec.ts --workers=1`
  → **4 passed**: explicit Present plus reload/Back/Forward/exit; direct load
  from restored storage with the service worker active; unknown, malformed and
  foreign anchors; no authored id and stale anchor on file switch. Every case
  compares the code-view text before and after, and the two navigation cases
  assert that no request leaves the app's origin.
- Full browser suite: `npm run e2e -- --workers=2` → **205 passed**.

### Screenshots and vision review

Captures in `test-results/screenshots/` (gitignored artifacts):

- `present-hash-explicit-light.png` — explicit Present, settled first beat,
  light theme.
- `present-hash-direct-dark.png` — direct load from the link under the service
  worker, dark theme.

Reviewed against `docs/STYLE-GUIDE.md` with the Laws of UX skill. The step
badge, centred participants, bottom transport, narration and progress match the
existing presentation goldens in both themes; label contrast and control
spacing are unchanged. The anchor itself adds no visible chrome, so it creates
no new alignment or focus surface. Outcome: **pass**, no open defects.

Residual risk: the link is only meaningful in the browser profile that owns the
workspace. Direct links cannot carry document content and are not a sharing
mechanism across profiles; this is documented in the changelog and was part of
the requested contract, not a defect.
