<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Postel’s Law

## Concise explanation

Be tolerant of valid variation in input and careful, predictable in output. Robustness should
help users recover without accepting ambiguous data or concealing important errors.

## PanelCraft application

Handle legacy settings and PDL defaults safely, preserve unknown valid data where required,
provide actionable parse diagnostics, and emit canonical deterministic files and exports.

## Common failure modes

- Silently discarding malformed or unrecognized user content.
- Accepting ambiguous input without explaining its interpretation.
- Producing inconsistent output across canvas, code, and CLI surfaces.

## Review questions

- Are backward compatibility and recovery explicit and tested?
- Does tolerant input handling still protect data integrity and user intent?

Source: [Laws of UX — Postel’s Law](https://lawsofux.com/postels-law/)
