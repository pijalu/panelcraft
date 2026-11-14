<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Doherty Threshold

## Concise explanation

Fast system feedback keeps attention on the task; long delays interrupt the interaction loop.
Responsiveness includes immediate acknowledgment, not only total completion time.

## PanelCraft application

Keep canvas manipulation and code feedback responsive, show honest progress for expensive
imports or rendering, and avoid blocking the editing loop during background work.

## Common failure modes

- Adding animation that delays access to the result.
- Reporting progress without actual work or allowing stale results to overwrite newer edits.
- Optimizing average speed while ignoring interaction stalls.

## Review questions

- Does every action receive timely, truthful feedback?
- Do reduced-motion and busy states remain clear without artificial delay?

Source: [Laws of UX — Doherty Threshold](https://lawsofux.com/doherty-threshold/)
