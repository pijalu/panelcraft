<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Mental Model

## Concise explanation

Users form internal explanations of how a system works. Interfaces are easier to learn when
their visible behavior matches those expectations and reveals a consistent conceptual model.

## PanelCraft application

Make the relationship between PDL source, canvas objects, files, flows, and browser-local
storage predictable. Explain imports and virtual filesystem behavior without implying host
filesystem access.

## Common failure modes

- Using the same term for document data and workspace UI settings.
- Silent transformations that contradict what the user edited.
- Assuming expert knowledge of PDL, routing, or storage internals.

## Review questions

- Can users predict where an edit will appear and where it will persist?
- Do labels and feedback correct likely misconceptions?

Source: [Laws of UX — Mental Model](https://lawsofux.com/mental-model/)
