# BUG-09 — cryptic identifiers instead of plain words

**Status:** fixed (rule + glossary + enforcement); legacy sites are converted as
files are touched, see "Residual" below.

## Observed

Commits, code comments and docs referred to work by bare tags — "M7", "UX08-WP13",
"SPEC §8.5", "FR-K3", "N7", "F-24", "CX-04". To a reader who has not memorised
`docs/SPEC.md` those are addresses with no meaning: "Sorted per N7" says nothing
about what the rule is, and a commit body "implements WP13" says nothing about
what shipped.

Measured before the change: **1006** lines in 305 source files and **941** lines
across 61 markdown documents carried an identifier this way.

## Expected

Every sentence stands on its own: the meaning is written out, and the tag — if it
still helps someone navigate — follows it as a pointer.

## Fix

1. **Glossary defined locally** — `agents.md` → "Identifiers in this repo" lists
   what each tag family points at (`M<n>`/`WP<n>` milestones and work packages,
   `F-<nn>` plan findings, `FR-<x><n>` requirements, `N<nn>` non-negotiables,
   `SPEC §n.m` sections, `CX-/UX-/FLOW-/DOC-` closed items), with a good and a bad
   example.
2. **Rule** — ground rule 6 and the commit convention now say: write the meaning;
   a short pointer may accompany it, never replace it.
3. **Enforcement** — `scripts/check-jargon.sh [base-ref]` scans the diff added
   since a base ref for bare tags in `*.ts`, `*.tsx`, `*.go`, `*.css`, `*.md` and
   exits non-zero with an explanation. Wired into `scripts/verify.sh` (stage
   `jargon`, both milestone and full chains) and into CI as
   "docs links + identifier clarity", which also runs the doc-link gate.

## Validation

- Guard fires on a violation:

      $ printf '// see F-24\n' >> web/src/ui/codePorts.ts
      $ bash scripts/check-jargon.sh HEAD; echo $?
      Opaque identifier-only references added since HEAD:
      +// see F-24
      1

- Guard passes a clean tree: exit `0`, "OK — no opaque identifier-only references
  added since HEAD".
- The check is diff-based, so the pre-existing 1947 lines do not turn the gate red
  while new work is held to the rule.

## Residual

The legacy corpus (1947 lines) is converted opportunistically — the boy-scout rule
in `agents.md`: a file that is touched gets its identifiers spelled out. Converting
all of it in one sweep would rewrite most comments in the project in a change with
no behavioural value, so it is deliberately not bundled with a bug fix.

## Why this matters

Two concrete costs showed up in this very session: a CI failure was first
misdiagnosed because "F-24 routing" was not explained anywhere near the code, and
the Pages failure was invisible because the workflow comment spoke of "SPEC FR-H"
rather than "this publishes the site".
