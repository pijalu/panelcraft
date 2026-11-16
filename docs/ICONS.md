# Built-in icon set — provenance and licensing

PanelCraft ships a fixed set of technical icons so a diagram of servers,
queues, gates and clients needs no assets of its own. This page is the licence
and provenance record for that set, and the rule for extending it.

## Licensing

* Every built-in icon is an **original work drawn in this repository** and is
  licensed **GPL-3.0-only**, like the rest of PanelCraft (ADR-0005). Each source
  file carries the SPDX header `SPDX-License-Identifier: GPL-3.0-only`.
* **No third-party or vendor artwork** is bundled: no brand logos, no
  manufacturer icon packs, no traced material, no icon-font glyphs. A vendor
  logo would also be a trademark question, which a technical diagram set should
  not raise.
* **No network fetch, no CDN, no icon font** (the offline-only rule): the geometry lives in
  `web/assets/icons/<handle>.svg` and is mirrored in
  `web/src/engine/render/icons.ts`; a sync test fails if the two ever disagree.

## How an icon is stored

Each source file is a 24×24 viewBox with one or more filled `<path>` elements.
The renderer scales the box to the shape's icon band and paints it with
`currentColor`, so a glyph follows the theme (light, dark, high contrast) instead
of carrying its own palette. Outline glyphs are drawn as evenodd-safe rings: an
outer contour plus a reversed inner contour.

Adding an icon means adding a source file, mirroring its paths in
`web/src/engine/render/icons.ts`, and adding a registry entry (label, category,
search keywords) in `web/src/engine/model/icons.ts`. The handle then becomes part
of the reserved namespace: a document icon may not reuse it (validation `P207`).

## The set

| Handle | Label | Category |
|---|---|---|
| `server` | Server | compute |
| `container` | Container | compute |
| `cluster` | Cluster | compute |
| `function` | Function | compute |
| `gear` | Service | compute |
| `database` | Database | storage |
| `cache` | Cache | storage |
| `storage` | Object storage | storage |
| `backup` | Backup | storage |
| `folder` | Folder | storage |
| `cloud` | Cloud | network |
| `cdn` | CDN | network |
| `network` | Network | network |
| `loadbalancer` | Load balancer | network |
| `gateway` | Gateway | network |
| `proxy` | Proxy | network |
| `queue` | Queue | network |
| `stream` | Event stream | network |
| `lock` | Lock | security |
| `shield` | Firewall | security |
| `key` | Key / secret | security |
| `certificate` | Certificate | security |
| `browser` | Browser | client |
| `mobile` | Mobile app | client |
| `user` | User | client |
| `users` | User group | client |
| `api` | API | platform |
| `mail` | Email | platform |
| `code` | Code | platform |
| `git` | Repository | platform |
| `package` | Package | platform |
| `terminal` | Terminal | platform |
| `monitor` | Monitoring | ops |
| `logs` | Logs | ops |
| `alert` | Alert | ops |
| `deploy` | Deploy | ops |
| `workflow` | Workflow | ops |
| `clock` | Scheduler | ops |
| `chart` | Analytics | data |
| `search` | Search | data |
| `document` | Document | concept |
| `external` | External system | concept |
| `group` | Group box | concept |

## Project icons (not listed here)

Icons declared inside a `.pcd` file belong to **that document**, not to this
set. They are the author's own asset, stored as canonical Base64 in the file
(see [FILE-FORMAT.md](FILE-FORMAT.md) §3.1 and
[ADR-0006](adr/0006-document-scoped-icons.md)), sanitized on ingest and on
render, and never uploaded anywhere.
