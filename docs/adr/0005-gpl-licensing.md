# ADR-0005: Licensing — GPL-3.0-only

- Status: Accepted
- Date: 2025-11-07
- Context: product owner decision

## Decision

PanelCraft is licensed under the **GNU General Public License v3.0 only**
(SPDX: `GPL-3.0-only`).

## Implementation rules

1. `LICENSE` (canonical GPLv3 text) at repo root — added in M0 scaffolding.
2. Every source file carries `SPDX-License-Identifier: GPL-3.0-only` (+ standard GPL
   header comment in Go/TS files).
3. **Dependency gate**: only GPL-compatible licenses (MIT, Apache-2.0, BSD, ISC).
   License check recorded in the ADR proposing each new dependency (see ADR-0004).
   Approved today: preact (MIT), codemirror (MIT), dagre (MIT), chromedp (Apache-2.0),
   fflate (MIT); dev tools MIT/Apache-2.0 — all compatible.
4. **Binary distribution** (GitHub Releases, SPEC FR-H2): corresponding source is
   satisfied by linking the public repository; release notes cite the exact commit.
5. **Documentation**: repo docs ship under the project license; CC-BY-SA-4.0 is the
   approved alternative for `docs/` and sample diagrams if stricter attribution is
   later desired (dual-declaration at file top).
6. GitHub Pages serves unmodified GPL-licensed assets — distribution is plain
   conveyance; no additional terms may be imposed (GPL §7).

## Consequences

+ Strong copyleft protects the project against closed forks.
− Blocks Apache-2.0-only or GPL-incompatible dependencies (e.g. some CC
  non-commercial assets) — the ADR dependency gate enforces this early.
− Icon fonts/clipart must be license-checked (GPL-compatible or public-domain) —
  tracked in M5 (icons milestone).
