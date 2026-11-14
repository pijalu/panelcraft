<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Tesler’s Law

## Concise explanation

Every system has irreducible complexity; simplification moves or manages that complexity
rather than eliminating it. Decide who should handle it and avoid dumping it onto users.

## PanelCraft application

Let tooling handle IDs, routing defaults, serialization, migration, and validation while
exposing meaningful architecture decisions and an inspectable PDL source representation.

## Common failure modes

- Hiding complexity until users cannot diagnose or control the result.
- Requiring manual bookkeeping that software can perform reliably.
- Adding opaque automation that changes user intent.

## Review questions

- Which complexity is intrinsic, and where is it currently handled?
- Does automation remain predictable, inspectable, and reversible?

Source: [Laws of UX — Tesler’s Law](https://lawsofux.com/teslers-law/)
