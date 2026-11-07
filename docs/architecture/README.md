# PanelCraft architecture workspace (PDL)

This directory is PanelCraft's **own architecture documentation**, authored in
PanelCraft's native format (PDL, `.pcd`) — dogfooding rule, SPEC §14 and
agents.md ground rule 7.

## Files

| File | Shows |
|---|---|
| `overview.pcd` | Deployment topology: SPA, browser storage, GitHub Pages, Go binary + headless Chrome; "Docs self-hosting" flow |
| `modules.pcd` | Web module graph: engine/workspace/ui packages with dependency directions (ports rule) |

## Status: UNVALIDATED (pre-M1)

The PDL parser lands in milestone M1. Until then these files follow
[../FILE-FORMAT.md](../FILE-FORMAT.md) grammar by hand and are **not machine-validated**.
M1 done-criteria include: `panelcraft validate docs/architecture` passes and each file
joins the golden corpus (round-trip green).

## Rules for contributors

* Architecture diagrams live **only** here, in `.pcd` — no ASCII/mermaid art in Markdown.
* Prose stays Markdown; normative content never lives in a picture alone.
* Keep files grammar-valid; they are corpus seeds — a broken doc file breaks CI from M1.
