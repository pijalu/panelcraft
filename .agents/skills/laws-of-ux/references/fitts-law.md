<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Fitts’s Law

## Concise explanation

Target acquisition depends on target size and distance. Frequently used or precise pointer
targets need adequate hit areas and sensible placement; keyboard access remains necessary.

## PanelCraft application

Provide forgiving hit areas for resize handles, connector endpoints, panel tabs, and toolbar
buttons while keeping visual marks subtle. Place related controls near their context.

## Common failure modes

- Making tiny visible handles equal to tiny clickable areas.
- Overlapping hit regions or letting floating panels move actions off-screen.
- Increasing target size until controls crowd one another.

## Review questions

- Are pointer targets easy to acquire at different zoom levels and viewport sizes?
- Are equivalent keyboard commands available and discoverable?

Source: [Laws of UX — Fitts’s Law](https://lawsofux.com/fitts-law/)
