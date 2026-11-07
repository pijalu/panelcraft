# PanelCraft Diagram Language (PDL) — File Format Specification

**Extension:** `.pcd` · **Encoding:** UTF-8 (no BOM) · **Format version:** `pcd/1`
**Status:** Draft v1 (implemented in M1) · **License:** GPL-3.0-only

PDL is PanelCraft's native text format. It is **line-oriented and mermaid-inspired**
(arrow-based links, `id` + `Label` node syntax) but is an **independent grammar**:
mermaid validity is *not* a goal (SPEC D7). Mermaid enters/leaves only via converters
(§8, §9). PDL is the single source of truth; the canvas is a projection of it.

Design goals, in order:

1. **Human-writable in code view** — a diagram readable top-to-bottom like source code.
2. **Lossless round-trip** — `PDL → IR → PDL` is byte-stable after canonical formatting.
3. **Forward compatible** — unknown-but-parseable constructs survive round-trips as data.
4. **Deterministic printing** — canonical printer output is stable (golden-tested, diffable).

---

## 1. Lexical rules

* Lines are the primary unit; blocks group lines with `{ … }`.
* Comments: `#` to end of line. Inside quoted strings `#` has no special meaning.
* Strings: double-quoted `"…"`; escapes `\"` and `\\`; unquoted *words* allowed where a
  single token suffices (`technology Go`), but the canonical printer always emits quotes.
* Identifiers (ids, aliases, tag names): `[a-z][a-z0-9_-]*`, case-sensitive, max 64 chars.
* Whitespace: leading indentation is **stylistic only** (blocks are brace-scoped) — the
  parser never infers structure from indentation.
* Line endings: `\n` (canonical); parser accepts `\r\n`.
* Max line length: none enforced; printer wraps labels > 100 chars only in views? **No —
  printer never wraps content** (stability over prettiness).

## 2. File structure

A file is an **ordered sequence of top-level statements**. Canonical order (printer
output; parser accepts any order, diagnostics for duplicates):

```
pcd 1.0                      ← REQUIRED, first non-comment line ("magic")
title "Checkout"             ← optional meta (0..n meta directives)
level container              ← context | container | component | deployment
direction LR                 ← auto-layout hint: LR | TB | RL | BT
theme dark                   ← light | dark (render hint only)

import billing as "../billing/system.pcd"    ← 0..n, see §5

<objects>                    ← 0..n, see §3
<links>                      ← 0..n, see §4
<flows>                      ← 0..n, see §6
<views>                      ← 0..n, see §7
<style-overrides>            ← 0..n, see §7.3
```

`pcd 1.0` — if absent or major version > implementation's, the file is rejected with a
version diagnostic (never silently mis-parsed).

## 3. Objects

```
ObjectStmt  := Kind Id [QuotedName] [Block]
Kind        := person | system | system_ext | container | component
             | datastore | queue | group | note
Block       := "{" Line* "}"
```

* `QuotedName` defaults to the id if omitted (printer always emits it).
* Block body — attribute statements, each at most once (duplicates = error):

```
description "…"
technology "…"
tag t1 t2 …                 ← repeatable; merges
property key "value"        ← repeatable; custom key-value (key = identifier)
contains id1 id2 …          ← group only: membership (membership is *only* set here,
                              i.e. an object never names its group)
attach id                   ← note only: anchored object id
icon name                   ← built-in icon id (M5)
```

* `group` renders as boundary rectangle around `contains` members (C4 boundary).
* `note` renders as sticky annotation; `attach` is optional (free-floating otherwise).

Example:

```
pcd 1.0
title "Checkout"
level container

person user "Shopper"
system shop "Webshop" {
  description "Storefront SPA"
  technology "React"
  tag core shop
  property owner "team-commerce"
}
system_ext erp "Legacy ERP"
container api "Checkout API" { technology "Go" tag core pci }
datastore db "Orders DB" { technology "PostgreSQL" }
queue events "order.events" { technology "Kafka" }
group ctx "Checkout context" { contains api db }
note n1 "PCI scope ends at PSP" { attach erp }
```

## 4. Links

```
LinkStmt    := Id ArrowTail [Type] ArrowHead Id [":" QuotedLabel] ["as" Id]
ArrowTail   := "-"          | "<-"
ArrowHead   := "->"         | "->"   (with head "<-" ⇒ direction flags)
Type        := "-" Ident "-"            e.g. -requests-  (default: uses)
Direction   := "a -> b" uni a→b · "a <- b" uni b→a · "a <-> b" bidirectional
```

Grammar (single coherent form, no mermaid alias soup):

```
a -type-> b : "label" as L1     typed, labeled, named
a -> b                          default type `uses`
a <- b : "polled by"            reversed direction
a <-> b                         bidirectional
```

* **Link ids**: optional via `as L1`. Auto-assigned at import/canvas-create as `L<n>`
  (first free number). Printer emits explicit ids **only when referenced** by a flow
  step (minimal noise) or when non-default type/style demands clarity — deterministic
  rule, golden-tested.
* **Multiple links between same pair**: allowed, distinguished by id.
* Link endpoints must resolve to objects or imported aliases (§5) — semantic validation.
* Block form for link attributes (rare; printer uses it only when needed):

```
api -publishes-> events as L7 {
  label "order created v2"
  style { dashed }
  waypoint (120, 300)         ← 0..n, canvas routing hints, view-independent
}
```

## 5. Imports (hybrid reuse, SPEC D1)

```
import Alias as "./relative/path.pcd"
```

* Path: workspace-relative, POSIX separators, must stay inside workspace (`..` may not
  escape root — traversal error).
* The imported file's top-level **objects become referenceable** as `Alias.objectId`.
* Imported objects render ghosted (dashed border, "imported" badge); read-only; link
  endpoints may reference them; flows may include them.
* Import graph must be **acyclic**; missing files are warnings with problem markers,
  not parse errors (diagram still renders).
* What is *not* imported: flows, views, styles, links of the imported file (links always
  live in the file that draws them).

## 6. Flows

```
FlowStmt    := "flow" [QuotedName] ["as" Id] "{" Step* "}"
```

Steps (ordered; each becomes one numbered beat in playback):

```
Step        := IntroStep | MsgStep | ProcessStep | AltStep | ParStep
             | GotoStep | InfoStep | ConclusionStep

IntroStep       := "intro" QuotedText
MsgStep         := Id LinkTail [Type] LinkHead Id [":" QuotedLabel] ["as" RefId] ["flip"]
                   // resolves to an existing link between the pair (see below)
ProcessStep     := "process" Id [QuotedText]
AltStep         := "alt" [QuotedText] "{" (Branch)* "}"
Branch          := QuotedText "{" Step* "}"          // branch label + its steps
ParStep         := "par" [QuotedText] "{" (Lane)* "}"
Lane            := "{" Step* "}"                      // unlabeled parallel lane
GotoStep        := "goto" [Target] ["return" ("end" | "here")]
                   Target := FilePath "#" FlowId      // other file (workspace-relative)
                          | FlowId                    // same file
InfoStep        := "info" QuotedText
ConclusionStep  := "conclusion" QuotedText
```

Rules:

* **MsgStep resolution**: the `(from,to)` pair (direction-insensitive) must match ≥1
  existing link in the file (or via imports). `as RefId` disambiguates; `flip` plays the
  step reversed (e.g. a response) without altering the underlying link.
* `alt` branches are OR; playback offers a chooser (default = first branch; choice is a
  playback-time concern, never stored).
* `par` lanes animate concurrently; visual lane split during those beats.
* `goto` may cross files (imports not required for goto — navigation-only); `return end`
  resumes after the goto step, `return here` at the goto step (default `end`).
* Empty flow, or flow whose every step is unreachable (no intro/msg/process), is a
  validation warning.

Example (see SPEC §7 for semantics):

```
flow "Happy path" as happy {
  intro "Customer buys a cart"
  user -> shop : "adds to cart"
  process api "Validates cart"
  alt "payment method" {
    "card"    { api -requests-> psp : "charge" }
    "invoice" { api -requests-> inv : "create invoice" }
  }
  par {
    { api -publishes-> events }
    { api -requests-> mail : "receipt" }
  }
  info "PCI scope ends at PSP"
  goto refunds
  conclusion "Order stored"
}
```

## 7. Views, positions, styles

### 7.1 Views

```
ViewStmt := "view" QuotedName ["as" Id] "{" ViewLine* "}"
ViewLine := "layout" ("auto" Dir | "saved")
          | "hide" "tag" Ident                       // repeatable
          | "hide" Id                                 // repeatable (element-level)
          | "position" Id "(" Number "," Number ")"   // saved coords, canvas units
          | "pin" Id                                  // excluded from auto-layout
```

* A file with no `view` gets the implicit default view (auto layout, everything visible).
* `layout saved` uses the `position` lines; nodes without position are auto-placed.
* Camera state (zoom/scroll) is **never persisted** in PDL (session concern).

### 7.2 Coordinates

Canvas units: 1 = 1 px at 100% zoom; origin top-left; y grows downward. Auto-layout
(dagre) outputs are written back only when the user explicitly commits layout ("apply
layout to file") — never silently.

### 7.3 Style overrides

```
style Id "{" StyleLine* "}"
StyleLine := fill ColorHex | stroke ColorHex | text ColorHex | icon Ident
           | shape (rect | round | cyl | queue | person | note)
```

* Colors: `#rgb` / `#rrggbb`. Theme supplies all defaults; `style` is override-only.
* Style overrides are also valid **inside** object/link blocks (`style { … }` line),
  canonical printer hoists them to top-level `style` statements? **No** — printer keeps
  styles where the user put them (stable diffing); hoisting is a formatter option, off
  by default.

## 8. Mermaid import (converter)

Input: `flowchart`/`graph` (mermaid v10 subset) and C4 statements. Converter = pure
function `text → PDL` (+ diagnostics), implemented identically in TS and Go (IR parity,
SPEC §8.2).

**Shape → kind mapping** (documented heuristic; overridable via `--map` flag on
`panelcraft convert`):

| Mermaid shape | PDL kind |
|---|---|
| `id(text)` rounded | component |
| `id[text]` rect | container (level container) / system (level context) |
| `id([text])` stadium | system_ext |
| `id[(text)]` cylinder | datastore |
| `id((text))` circle | person |
| `id>text]` asymmetric | queue |
| `id{text}` rhombus | note (decision) |
| `subgraph` | group (children → `contains`) |

**C4 mapping**: `System(x,…)`→system, `System_Ext`→system_ext, `Person`→person,
`Container*`→container, `Component*`→component, `SystemDb/Queue`→datastore/queue,
`Rel(a,b,"label","tech")`→link (`tech` → link `style` comment property `technology`).
`Show*`, `Update*`, layout/skinparams: ignored with info diagnostics.

Edges: `-->`, `---`, `-.->`, `==>`, labels (`|text|` and `--text-->`), chained
`a --> b --> c` (expanded), `&` multi-endpoints (expanded to pairs).

Everything else (classes, themes, flowcharts-v2 specifics like `&` subgraph links,
nested subgraph ids): warning + skipped, never silent.

## 9. Mermaid export (lossy, declared)

`PDL → flowchart TD` with:

* Objects → shapes per inverse mapping table; groups → `subgraph`.
* Links → `-->` with `|label|`; type retained in label prefix when non-`uses`
  (`"requests: POST /checkout"`) — cheap, lossless-enough convention.
* Tags → mermaid `classDef` (one class per tag), applied via `class` statements.
* Fill colors of `style` overrides → `style id fill:#…`.

**Dropped (declared, per SPEC FR-M4):** flows, positions/layout, views, imports
(exported file is flattened: imported objects inlined and marked via comment `%%
imported from …`), properties, notes detach, icons, waypoints, custom shapes.
C4 export mode (`--c4`): emits C4Context/Container statements when kinds fit, else
fallback flowchart.

## 10. Validation rules (semantic pass; `panelcraft validate`)

| Code | Severity | Rule |
|---|---|---|
| P100 | error | duplicate object/flow/view id |
| P101 | error | link/flow-step endpoint resolves to nothing |
| P102 | error | import cycle |
| P103 | error | import path escapes workspace |
| P104 | error | flow msg-step references non-existent link pair (without `as`) |
| P105 | error | group `contains` unknown id / nested group in group (v1: flat groups) |
| P106 | error | note `attach` unknown id |
| P200 | warning | missing import file (renderable without it) |
| P201 | warning | orphan object (no links, no flow references) |
| P202 | warning | empty flow / flow without visual steps |
| P203 | warning | `style` targets non-existent id |
| P204 | info | position overlaps (view-time concern; reported, not fixed) |

Exit codes per SPEC FR-X. All findings carry `line:col` of the offending token.

## 11. Canonical formatting (printer)

* Fixed section order (§2), objects in **first-definition order**, links likewise.
* One attribute per line; 2-space indent per block level.
* Quotes on all strings; explicit link ids only when referenced (§4 rule).
* Printer is idempotent: `format(format(x)) == format(x)` — golden-tested.
* Formatter preserves comments by attaching them to the following statement.

## 12. Forward compatibility policy

* Unknown top-level statement: parse error (fail fast — version gate protects).
* Unknown *attribute* inside a known block: kept as raw data (`attributes[]` in IR),
  warning P2xx, re-emitted verbatim on print. Minor version bumps add attributes.
* Format minor version (`pcd 1.x`): additive only; `pcd 2` = new major, converter path.

## 13. EBNF (core, informative)

```ebnf
file        = "pcd" version , { stmt } ;
version     = number , [ "." number ] ;
stmt        = meta | import | object | link | flow | view | style ;
meta        = ("title" string) | ("level" ident) | ("direction" ident) | ("theme" ident) ;
import      = "import" ident "as" path ;
object      = kind ident , [ string ] , [ "{" , { attr } , "}" ] ;
attr        = ("description" , string) | ("technology" , string) | ("tag" , ident { ident })
            | ("property" , ident , string) | ("contains" , ident { ident })
            | ("attach" , ident) | ("icon" , ident) ;
link        = ident , arrow , ident , [ ":" , string ] , [ "as" , ident ] , [ linkblock ] ;
arrow       = [ "<" ] , "-" , [ ident , "-" ] , [ ">" ] ;   (* <-, ->, <->, -type-> *)
flow        = "flow" , [ string ] , [ "as" , ident ] , "{" , { step } , "}" ;
step        = intro | msg | process | alt | par | goto | info | conclusion ;
alt         = "alt" , [ string ] , "{" , { branch } , "}" ;
branch      = string , "{" , { step } , "}" ;
par         = "par" , [ string ] , "{" , { lane } , "}" ;
lane        = "{" , { step } , "}" ;
goto        = "goto" , [ path , "#" ] , ident , [ "return" , ("end"|"here") ] ;
view        = "view" , string , [ "as" , ident ] , "{" , { viewline } , "}" ;
style       = "style" , ident , "{" , { styleline } , "}" ;
```

(Formal EBNF is the implementation reference; this section is the readable summary.
Where prose and EBNF disagree, prose wins until M1 lands and this doc is regenerated
from the grammar tests.)

---

## 14. Full example (normative sample, corpus seed `corpus/checkout.pcd`)

```
pcd 1.0
title "Checkout"
level container
direction LR

import common as "../common/actors.pcd"      # provides common.psp

person user "Shopper"
system shop "Webshop" {
  description "Storefront SPA"
  technology "React"
  tag core
  property owner "team-commerce"
}
container api "Checkout API" { technology "Go" tag core pci }
datastore db "Orders DB" { technology "PostgreSQL" }
queue events "order.events" { technology "Kafka" }
system_ext psp "Payment Provider"            # imported in real files; inlined here
group ctx "Checkout context" { contains api db }

user -> shop : "browses catalog"
shop -requests-> api : "POST /checkout" as L1
api -writes-> db
api -publishes-> events as L3
api -requests-> psp : "charge card" as L4

flow "Happy path" as happy {
  intro "Customer buys a cart"
  user -> shop : "adds to cart"
  process api "Validates cart"
  alt "payment method" {
    "card"    { api -> psp : "charge" as L4 }
    "invoice" { info "invoicing not in this story" }
  }
  par "fan-out" {
    { api -> events as L3 : "order created" }
    { process mailx "send receipt" }        # ← unknown id `mailx` → P101 (kept for corpus test)
  }
  info "PCI scope ends at PSP"
  conclusion "Order stored"
}

view "Main" {
  layout auto LR
  position user (80, 120)
  position api (420, 90)
}

style api { fill #2d6cdf }
```

> The deliberately broken line (`process mailx`) documents that **semantic** validation
> reports P101 with position while the rest of the file still parses (error isolation);
> lexical/syntax errors abort the parse for that file only.
