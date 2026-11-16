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
size <w> <h>                ← explicit canvas geometry in document units (IR v2, F-13)
z <int>                     ← explicit stacking order; absent = auto (IR v6, CX-03)
```

* `size` is presentation geometry, not semantics: it is optional, positive, and
  absent means "the kind's default shape". The canvas writes it only for objects
  the user actually resized (or whose name was fitted); auto-layout never writes
  it. Values are plain numbers (`size 200 96`); the printer renders them with the
  same number formatting as `position`/`waypoint`.

* `group` renders as boundary rectangle around `contains` members (C4 boundary).
* `note` renders as sticky annotation; `attach` is optional (free-floating otherwise).

* **Stacking order (CX-03, IR v6)**: `z <int>` is an optional safe integer that
  overrides an object's paint and hit-test order. Absent means *auto*, which
  behaves as effective `z 0` **and** keeps document order: with every object on
  auto the document order is reproduced exactly, and equal `z` values keep
  document order (stable sort). Negative values sink below auto objects,
  positive values rise above them. Auto is the default and is never printed;
  an explicit `z 0` is printed because it is a real user choice. `z` applies to
  every object kind, including `group` boundaries. Links are unaffected and
  always paint below objects. The same projection drives the canvas, hit-testing,
  the mini-map, SVG/PNG export and CLI rendering. Mermaid export declares
  `object stacking order` as dropped.

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
* **Per-step dwell (F-18)**: a leaf step (`intro`, `info`, `conclusion`, `process`,
  `msg`, `goto`) accepts a trailing `delay <ms>`, e.g.
  `a -> b : "hi" delay 1200`. It overrides the beat's default auto-advance time for
  that step only; the printer emits it only when present, and the IR carries it as
  `delayMs`. `alt`/`par` blocks do not take a delay (their beats follow the branches).

* Block form for link attributes (rare; printer uses it only when needed):

```
api -publishes-> events as L7 {
  label "order created v2"
  tag critical async           ← repeatable; merges (M6: tag filter fade)
  style { dashed }
  anchor from 0.125             ← optional normalized start perimeter anchor (IR v4)
  anchor to 0.875               ← optional normalized end perimeter anchor (IR v4)
  allow overlap                ← optional avoidance opt-out (IR v5; true-only)
  waypoint (120, 300)          ← 0..n, canvas routing hints, view-independent
}
```

* **Endpoint perimeter anchors (CX-01, IR v4)**: `anchor from <n>` and
  `anchor to <n>` each accept `0 <= n < 1`; either may be present independently.
  They select exact points on the entity's rectangular object bounds, including
  corners. Each side owns a quarter of the normalized range, clockwise from the
  top-left corner: top `[0, .25)`, right `[.25, .5)`, bottom `[.5, .75)`, and
  left `[.75, 1)`. Thus `0`, `.25`, `.5`, and `.75` are respectively the
  top-left, top-right, bottom-right, and bottom-left corners. Within a quarter,
  the value is a side-relative fraction, so resizing preserves the intended
  attachment. Missing anchors retain automatic side/midpoint routing.
  Orthogonal, straight, curved and explicit-waypoint routes all use the same
  resolved endpoints. Mermaid export declares `endpoint perimeter anchors` as
  dropped because Mermaid has no equivalent data.

* **Overlap avoidance (IR v5)**: automatic
  orthogonal routes avoid solid non-group objects — *including the route's own two
  endpoints*, which may only be touched at their ports and clearance stubs — and
  previously routed links where a reasonable bounded candidate exists. Document order
  is deterministic; clear existing routes stay unchanged, shared endpoint points are
  allowed, and parallel/coincident links use separate channels when possible. Explicit
  perimeter anchors keep their outward stubs. Group boundaries are not solid obstacles,
  but their non-group children are. Candidates are scored by interior crossings, then
  shared lines with other connectors, then direction reversals (a connector that runs
  out, back and out again reads as a loop), then length, so a detour stays bounded and
  readable. If every candidate conflicts, the minimum-conflict, shortest deterministic
  fallback is used; dense graphs can therefore retain crossings, and such a connector
  reports it. `allow overlap` opts one link out of object and connector avoidance. It
  is emitted only when true; absence and false have identical default behavior.

  Explicit `waypoint` geometry remains authoritative and bypasses *automatic*
  avoidance with or without this override: a bend outside every shape is honoured even
  when a shorter automatic route exists, and each leg between bends is still routed
  around entity rectangles so a detour never becomes a crossing. A bend that lies
  **inside** an entity cannot be drawn without covering the shape and its label, so it
  is skipped rather than silently relocated: the printed document keeps the authored
  `waypoint` line untouched, and the connector carries the reason (`data-route-warning`
  and its accessible description), e.g. `charges: bend 2 at (432, 70) is inside Payment
  provider — the route skips it.` Canvas, minimap, SVG/PNG and CLI use the committed
  route polylines. Mermaid export declares `overlap overrides` as dropped because the
  target has no equivalent data.

* **Connector sparks (FLOW-02, IR v7)**: `sparks <1..8>` sets how many tokens travel
  a link during a message step and `speed <0.25..4>` scales their motion, where `1`
  is the historical single-token default speed. Absent values reproduce the old
  behaviour exactly and are never printed. Counts are staggered deterministically
  along the path; a one-way link completes once per step, while a `<->`
  bidirectional link reverses at the far end and ping-pongs until the step ends.
  `flip` only chooses the initial direction. Sparks never change flow timing, step
  dwell or validation, and reduced motion keeps the static emphasis with no
  moving tokens.

* **Arrow visual model (F-12)** — links accept these `style` keys, all optional:

```
style {
  head diamond                 ← arrow-head marker: arrow | open | diamond | circle | square | none
  tail circle                  ← marker at the link's tail (same set; default none)
  line dotted                  ← texture: solid | dashed | dotted
  route curved                 ← geometry: orthogonal | straight | curved (IR v3)
  width 2.5                    ← stroke width in document units
  dashed                       ← legacy alias of `line dashed`
}
```

  Absent keys fall back to `head arrow`, `tail none`, `line solid`, `route orthogonal`,
  width 1.5. The printer emits only the keys the document carries, so canvas writes stay
  minimal. Straight and curved routes retain explicit waypoints without orthogonal
  obstacle detours; two-point curves use endpoint tangents and waypoint curves use
  Catmull-Rom-derived cubic Bézier segments. Curves are sampled for hit-testing and
  deterministic link-label placement. Labels prefer their route midpoint, then stable
  nearby candidates that avoid solid objects, unrelated routes, and earlier labels, and that
  stay inside the drawn frame; they paint above shapes (with a backing box, bounded wrapping
  and a leader when displaced) while the routes stay below them. Labels never hold the
  pointer. Placement is view-independent, so a given document always labels the same way.
  `head`/`tail`/`line`/`route`/`width` are link-only; the object style block rejects neither
  (they round-trip) but the renderer ignores them there.

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
FlowStmt    := "flow" [QuotedName] ["as" Id] "{" ["description" QuotedText] Step* "}"
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

StepPresentation := ["presentation" "{" PresentationLine* "}"]   // after any step
PresentationLine := "description" QuotedText
                  | "camera" ("auto" | "hold"
                              | "focus" "(" Number "," Number ")" ["zoom" Number])
                  | "duration" Number                              // camera, 0–300 ms
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

* **Presentation metadata (IR v8)**: an optional `presentation { … }` block may follow *any*
  step — including `alt`/`par` after their closing brace. It carries three order-free lines,
  each at most once:

  * `description "…"` — one line of prose for the step (what the presenter narrates). The
    flow itself may carry a matching `description` at the top of its body.
  * `camera auto | hold | focus (x, y) [zoom n]` — `auto` is the default when a step has no
    camera at all, `hold` keeps the previous camera, `focus` frames a canvas point
    (`x`, `y` in document units) with an optional `zoom` inside the existing 0.1–4 limits.
  * `duration <ms>` — camera transition time, 0–300 ms. It needs a `camera` line in the
    same block (a duration without one is a syntax error), and it is *separate* from the
    step's `delay <ms>` dwell: dwell is reading time, duration is travel time.

  Absent metadata prints nothing, so a pre-v8 document keeps its canonical form byte for
  byte. The canonical block order is description, camera, duration, regardless of source
  order, and metadata is only ever stored here — never in a UI-only side channel. Camera
  and step descriptions are flow concepts and never appear on `view` lines. Mermaid export
  declares them as drops (see MERMAID-MATRIX).

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

Group boundaries are compound layout parents, so a link whose endpoint is a `group`
is drawn from the boundary's computed rectangle but does not steer auto-layout; the
ranks come from the entity links only. Such a document stays valid and renderable.

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
imported from …`), properties, notes detach, icons, endpoint perimeter anchors,
waypoints, overlap overrides, object stacking order, custom shapes.
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
            | ("attach" , ident) | ("icon" , ident)
            | ("size" , number , number) | ("z" , number) ;
link        = ident , arrow , ident , [ ":" , string ] , [ "as" , ident ] , [ linkblock ] ;
arrow       = [ "<" ] , "-" , [ ident , "-" ] , [ ">" ] ;   (* <-, ->, <->, -type-> *)
flow        = "flow" , [ string ] , [ "as" , ident ] , "{" , { step } , "}" ;
step        = ( intro | msg | process | alt | par | goto | info | conclusion ) , [ delay ] ;
delay       = "delay" , number ;   (* per-step dwell in ms, F-18 *)
alt         = "alt" , [ string ] , "{" , { branch } , "}" ;
branch      = string , "{" , { step } , "}" ;
par         = "par" , [ string ] , "{" , { lane } , "}" ;
lane        = "{" , { step } , "}" ;
goto        = "goto" , [ path , "#" ] , ident , [ "return" , ("end"|"here") ] ;
anchor      = "anchor" , ("from" | "to") , number ;   (* normalized 0 <= n < 1 *)
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
    { process mailx "send receipt" }        # unknown id `mailx` → P101 (kept for corpus test)
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

---

## 15. Errata and frozen-grammar rulings (M1 normative)

Rulings made while implementing M1 (docs/milestones/M1.md D-M1-*). The grammar is
**frozen at pcd/1** as amended here; changes beyond this list require a version bump.

**Lexical**
- E-01 Colors vs comments: `#` followed by exactly 3 or 6 hex digits and a
  delimiter lexes as COLOR; any other `#` starts a comment (§1 now normative).
- E-02 `//` line comments are accepted alongside `# …` (same comment token;
  drivers: SPDX headers on source files and the architecture seeds).
- E-03 Identifiers: `[a-zA-Z][a-zA-Z0-9_-]*`, max 64 chars (§1 said
  lowercase-only; §4's auto link ids are `L<n>`, so uppercase first letters are
  legal). Overlong runs are E102.
- E-04 A trailing same-line comment attaches to the FOLLOWING statement (the
  lexer has no token-boundary lookahead); comments inside blocks accumulate and
  attach to the next parsed statement, never dropped (§6).

**Grammar**
- E-05 Msg-step modifiers `: "label"`, `as Ref`, `flip` are order-free (§14's
  `as L3 : "label"` is legal; §6's label-first ordering was narrower than
  intended). The EBNF above is the normative superset.
- E-06 `goto` requires a target (§6's optional Target was a typo); a quoted
  target must be `"path#flowId"`. `return end` is the default and is not stored.
- E-07 Reversed arrows normalize: `a <- b` stores `from=b, to=a` (plus type);
  the canonical printer always emits `->`. `<->` keeps endpoints, sets
  `bidir: true` (§4).
- E-08 Duplicate meta directives: first wins, warning W100 (§2).
- E-09 Tagged-id lists (`tag`, `contains`) are line-scoped: members must sit on
  the same line as the keyword (§3).
- E-10 Link/flow/view ids are data: the canonical printer emits `as <id>`
  whenever an id was recorded, including unreferenced link ids — lossless
  round-trip wins over §4's minimal-noise sketch (§1.2).
- E-11 Empty collections (`tags`, `contains`, `waypoints`) vanish in canonical
  IR JSON and print — absent, not `[]` (§11).
- E-12 Fields the parser recorded are emitted even when empty strings
  (`title ""`, `person a ""`, `a -> b : ""`); Go's IR models presence with
  `*string` for exactly those fields (implementation note, D-M1-22).
- E-13 Objects print in block form only when they have content (F-05): the
  grammar makes the block optional (`object = kind ident , [ string ] , [ "{" ,
  { attr } , "}" ]`), so an attribute-less object prints as `person a "A"` and
  a `{}` style block parses to "no style" and is omitted (§3, §11).
- E-14 Nesting limit: 32 levels, deeper = E112 (§6).
- E-15 Syntax errors (E100–E113) abort the whole file (doc = null + diagnostics);
  semantic findings never abort (§10, §14 sample).

**Validation**
- E-16 P104 covers both msg-step forms: without `as`, an undirected link pair
  must exist in either direction; with `as`, the referenced link id must exist.
  P106 applies to any object used as `attach` target. P201 counts links and flow
  references only (attached notes still warn — accepted). P202 "visual" steps =
  msg/process/alt/par/goto. Severity split (§10) gates the CLI exit code:
  **exit 1 only for error-severity findings**; warnings/info never fail
  (`panelcraft validate docs/architecture` stays exit 0 with P201 warnings).
- E-17 Unknown block attribute: kept as raw data, warning **P205** (§12 said
  "P2xx"; the assigned code is P205).
- E-18 Import rules: P102 cycle (error), P103 workspace-escaping path (error),
  P200 missing file (warning, still renderable) — traversal is injected via an
  ImportSource so pure validation stays IO-free (§5, §10).

**Canonical IR JSON**
- E-19 Key order is fixed (TS builder order = Go struct field order); empty
  arrays omitted; `true`-only booleans (`bidir`, `flip`, `dashed`); 2-space
  indent + trailing newline; no HTML escaping in `<`, `>`, `&` (§11).

**Import converters (§8)**
- E-20 Converters are best-effort and never silent: presentation directives →
  M100 (info), unknown/unsupported lines → M200 (warning); full mapping table in
  docs/milestones/M1.md D-M1-21. Mermaid `---` prints as `->` (plain) —
  undirectedness is not representable in the IR (accepted approximation).

**Tooling**
- E-21 `panelcraft validate` exit codes: 0 = no error-severity findings, 1 =
  ≥1 error finding or parse abort, 2 = usage error. PATH: files or directories
  (a directory globs `*.pcd`, non-recursive, sorted). `validate --json` emits
  `{files,errors,warnings,infos}`.
