# Changelog

All notable changes to PanelCraft. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: SemVer (pre-1.0 = milestone-driven).

## [Unreleased]

### Added — M0 Scaffolding (PLAN §2)

- Canonical GPL-3.0-only LICENSE (replaces pre-M0 placeholder).
- Web build: vite + Preact + TypeScript strict; eslint complexity gates
  (≤12); vitest + v8 coverage with thresholds (core 80%, `ui/*` 60% reported).
- Go shell: `panelcraft serve` (embedded SPA, strict CSP, SPA fallback,
  read-only `/files/*`, dev-mode `--dev-dir`) and `panelcraft version`.
- CI: `ci.yml` stage chain (SPEC §8.5), `pages.yml` + `release.yml` stubs
  (deploy/release engineering land with M7).
- `scripts/verify.sh` multi-stage local gate (`m0` first) and
  `scripts/check-selfcontained.sh` asset-origin scan (N7/N11).
- Playwright scaffold: S7 no-network smoke + light/dark screenshot baselines,
  pixelmatch visual-diff util.
- Docs: STYLE-GUIDE (tokens + vision checklist), ARCHITECTURE skeleton,
  milestone log `docs/milestones/M0.md`.
