# Presentation effects outlived jsdom teardown

Status: **closed — test-only lifecycle fix validated on 2026-11-20.**

## Observed

`npx vitest run` reported all 1,760 tests passed but exited 1 with unhandled
`window is not defined`, `document is not defined`, or `cancelAnimationFrame is not
defined` errors from `PresentDock.tsx` effect cleanup. The stack showed Preact invoking
cleanup from a timeout after the test's jsdom environment had been torn down.

This was a test lifecycle failure, not a production presentation failure. The affected
suites called synchronous testing-library cleanup but did not give Preact's deferred
effect cleanup a chance to run before the environment disappeared.

## Fix

`FramingPopover.test.tsx` and `FlowNotesPanel.test.tsx` now await one macrotask after
cleanup. The already-scheduled Preact cleanup therefore runs while `window`, `document`,
and animation-frame functions still exist. Production code and assertions are unchanged;
no errors are suppressed.

## Validation

- Focused presentation suites: 3 files, 16 tests passed.
- Exact original command `npx vitest run`: 162 files and 1,760 tests passed, exit 0,
  with no unhandled-error section.
- `npm run check` — passed after the test changes.
- Repository hygiene gate passed after the commit.
