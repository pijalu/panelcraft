<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Working Memory

## Concise explanation

Working memory temporarily holds and manipulates limited task information. Interfaces should
externalize context and avoid making users retain details across distracting steps.

## PanelCraft application

Keep selected object/link summaries, flow participants, dirty state, and source/target choices
visible. Offer canvas picking and readable labels rather than requiring raw-ID memorization.

## Common failure modes

- Clearing selection or pending choices when a panel closes or a dialog opens.
- Requiring users to compare distant code and canvas states mentally.
- Overloading the screen with context unrelated to the current task.

## Review questions

- Which task information remains visible throughout the operation?
- Can users recover context after interruption without starting over?

Source: [Laws of UX — Working Memory](https://lawsofux.com/working-memory/)
