// SPDX-License-Identifier: GPL-3.0-only
// Shared TS⇄Go parity fixture (M1-WP7) — the WP2–WP4 test tables as data.
// `CORPUS_FIXTURE=1 npx vitest run web/src/engine/format/parity.test.ts`
// regenerates testdata/pdl-cases.json from the TS engine (the reference
// implementation); plain runs assert the committed fixture still matches TS.
// The Go port (internal/pdl) consumes the same JSON — parity is a gate.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { validateDoc } from '../model/validate';
import { serializeDoc } from '../model/serialize';
import { encodeIconSvg } from './iconSvg';

// Icon payloads are Base64 of an SVG, and every payload therefore begins with
// the same four letters — which happen to look exactly like this repo's short
// work-item tags — so the fixtures build their payloads from readable markup
// instead of embedding the encoded blob.
const SVG_SQUARE = encodeIconSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>');
const SVG_CIRCLE = encodeIconSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#0af"/></svg>');
const SVG_EVIL = encodeIconSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0h1v1H0z" onload="x()" xlink:href="http://evil.example/x"/></svg>');

interface Case {
  name: string;
  src: string;
}

/** One fixture record: parse + print + serialize + validate expectations. */
interface FXCase {
  name: string;
  src: string;
  doc: string | null;
  print: string | null;
  parseDiags: unknown[];
  validateDiags: unknown[];
}

interface FX {
  version: number;
  cases: FXCase[];
}

const FIXTURE_PATH = join('testdata', 'pdl-cases.json');

const deepNest = (levels: number): string => {
  let body = 'intro "core"';
  for (let i = 0; i < levels; i += 1) body = `alt {\n"arm" {\n${body}\n}\n}`;
  return body;
};

const CASES: Case[] = [
  { name: 'magic-only', src: 'pcd 1.0\n' },
  { name: 'lead-comments', src: '# hello\n// SPDX-License-Identifier: GPL-3.0-only\npcd 1.0\n' },
  { name: 'metas', src: 'pcd 1.0\ntitle "Demo"\nlevel container\ndirection LR\ntheme dark\n' },
  { name: 'duplicate-meta-warns', src: 'pcd 1.0\nlevel container\nlevel context\n' },
  {
    name: 'object-full',
    src: `pcd 1.0
person alice "Alice" {
  description "The user"
  technology "React"
  tag admin staff
  property tier gold
  contains cart
  attach note1
  icon user
  style {
    fill #ff00aa
    stroke #fff
    text #000
    icon bolt
    shape rounded
    dashed
  }
  blur "2px"
}
# attached note
note note1 "Note"
container cart "Cart"
`,
  },
  { name: 'object-no-block', src: 'pcd 1.0\nperson a "A"\n' },
  {
    name: 'object-size',
    src: 'pcd 1.0\nsystem a "A" {\n  size 200 96\n}\nsystem b "B" {\n  size 48.5 32\n}\n',
  },
  {
    name: 'object-size-invalid',
    src: 'pcd 1.0\nsystem a "A" {\n  size 0 10\n}\n',
  },
  {
    name: 'object-stacking-z',
    src: 'pcd 1.0\nsystem auto "Auto"\nsystem back "Back" {\n  z -2\n}\nsystem zero "Zero" {\n  z 0\n}\nsystem front "Front" {\n  z 4\n}\n',
  },
  {
    name: 'object-stacking-z-invalid',
    src: 'pcd 1.0\nsystem a "A" {\n  z 1.5\n}\n',
  },
  {
    name: 'flow-advance',
    src: 'pcd 1.0\nsystem a "A"\nsystem b "B"\na -> b as L1\nflow "Wait" as wait {\n  intro "start" advance click\n  a -> b : "go" delay 1200 advance end\n}\n',
  },
  {
    name: 'flow-advance-invalid',
    src: 'pcd 1.0\nflow "Wait" as wait {\n  intro "start" advance later\n}\n',
  },
  {
    name: 'link-sparks',
    src: 'pcd 1.0\nperson a "A"\nsystem b "B"\na -requests-> b as L1 {\n  style {\n    sparks 3\n    speed 2\n  }\n}\nb <-> a as L2\n',
  },
  {
    name: 'link-sparks-invalid',
    src: 'pcd 1.0\na -> b {\n  style {\n    sparks 9\n  }\n}\n',
  },
  {
    name: 'link-speed-invalid',
    src: 'pcd 1.0\na -> b {\n  style {\n    speed 0\n  }\n}\n',
  },
  {
    name: 'link-style-model',
    src: 'pcd 1.0\nsystem a "A"\nsystem b "B"\na -requests-> b as L1 {\n  style {\n    head diamond\n    tail circle\n    line dotted\n    route curved\n    width 2.5\n  }\n}\n',
  },
  {
    name: 'link-endpoint-anchors',
    src: 'pcd 1.0\nsystem a "A"\nsystem b "B"\na -> b as L1 {\n  anchor from 0.25\n  anchor to 0.875\n  waypoint (180, 100)\n}\n',
  },
  {
    name: 'link-endpoint-anchor-partial',
    src: 'pcd 1.0\na -> b {\n  anchor from 0\n}\n',
  },
  {
    name: 'link-endpoint-anchor-invalid',
    src: 'pcd 1.0\na -> b {\n  anchor to 1\n}\n',
  },
  {
    name: 'link-allow-overlap',
    src: 'pcd 1.0\nsystem a "A"\nsystem b "B"\na -> b as L1 {\n  allow overlap\n}\n',
  },
  {
    name: 'link-allow-overlap-duplicate',
    src: 'pcd 1.0\na -> b {\n  allow overlap\n  allow overlap\n}\n',
  },
  {
    name: 'link-style-invalid-line',
    src: 'pcd 1.0\nsystem a "A"\nsystem b "B"\na -> b as L {\n  style {\n    line dashdot\n  }\n}\n',
  },
  {
    name: 'link-style-invalid-route',
    src: 'pcd 1.0\nsystem a "A"\nsystem b "B"\na -> b as L {\n  style {\n    route diagonal\n  }\n}\n',
  },
  {
    name: 'links-and-arrows',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b : "hello" as l1
b <- a
a -requests-> b
a <-> b
`,
  },
  {
    name: 'link-block',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b : "label" as l1 {
  tag sync critical
  tag sync
  style {
    stroke #333
    dashed
  }
  waypoint (10, 20)
  waypoint (30.5, 40)
  glow "on"
}
`,
  },
  {
    name: 'flow-full',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b as l1
flow "Checkout" as checkout {
  intro "Welcome"
  a -> b : "click"
  b -> a flip
  a -> b : "m1" as l1 flip
  process a
  process b "processing"
  info "note"
  conclusion "done"
  goto other
  goto "other.pcd#other" return here
  goto pay return end
  alt "path?" {
    "yes" {
      a -> b
    }
    "no" {
      # nothing
      info "skip"
    }
  }
  par {
    { a -> b }
    { info "lane2" }
  }
}
`,
  },
  {
    name: 'step-delay',
    src: 'pcd 1.0\nperson a "A"\nperson b "B"\na -> b as L\nflow "F" as f {\n  intro "start" delay 400\n  a -> b : "hi" as L delay 1200\n  process a "work" delay 250\n  info "note"\n  goto "f" return here delay 800\n}\n',
  },
  {
    name: 'step-delay-negative',
    src: 'pcd 1.0\nflow "F" {\n  intro "x" delay -5\n}\n',
  },
  {
    name: 'presentation-flow-description',
    src: 'pcd 1.0\nflow "Checkout" as checkout {\n  description "A customer submits an order."\n  intro "Start"\n}\n',
  },
  {
    name: 'presentation-all-step-kinds',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b as L
flow "F" as f {
  intro "Welcome" presentation {
    description "Intro text"
  }
  info "Note" presentation {
    description "Info text"
  }
  conclusion "Done" presentation {
    description "Conclusion text"
  }
  process a "work" presentation {
    description "Process text"
  }
  a -> b : "call" as L presentation {
    description "Message text"
  }
  goto f return here presentation {
    description "Goto text"
  }
  alt "path?" {
    "yes" {
      info "y"
    }
  } presentation {
    description "Alt text"
  }
  par {
    { info "lane" }
  } presentation {
    description "Par text"
  }
}
`,
  },
  {
    name: 'presentation-camera-modes',
    src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera auto\n    duration 300\n  }\n  info "B" presentation {\n    camera hold\n  }\n  conclusion "C" presentation {\n    camera focus (420, 180) zoom 1.25\n  }\n  intro "D" presentation {\n    camera focus (10.5, 20.25) zoom 0.1 duration 0\n  }\n}\n',
  },
  {
    name: 'presentation-order-and-delay',
    src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    duration 200\n    camera auto\n    description "D"\n  }\n  info "B" delay 100 presentation {\n    camera hold\n  }\n}\n',
  },
  { name: 'presentation-empty-block', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n  }\n}\n' },
  { name: 'presentation-zoom-out-of-range', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera focus (1, 2) zoom 9\n  }\n}\n' },
  { name: 'presentation-duration-out-of-range', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera auto\n    duration 900\n  }\n}\n' },
  { name: 'presentation-duration-without-camera', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    duration 200\n  }\n}\n' },
  { name: 'presentation-unknown-key', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    sparkle yes\n  }\n}\n' },
  { name: 'presentation-duplicate-key', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera auto\n    camera hold\n  }\n}\n' },
  { name: 'presentation-focus-needs-point', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera focus 420 180\n  }\n}\n' },
  { name: 'presentation-invalid-mode', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera swoop\n  }\n}\n' },
  { name: 'presentation-unclosed', src: 'pcd 1.0\nflow "F" {\n  intro "A" presentation {\n    camera auto\n' },
  {
    name: 'import-qualified-refs',
    src: 'pcd 1.0\n\nimport shared as "../shared/actors.pcd"\n\nsystem api "API"\nperson a2 "A2"\n\napi -> shared.psp : "call" as L1\n\na2 <- shared.auth as L2\n\nflow "F" {\n  intro "x"\n  api -> shared.psp\n  process shared.psp\n}\n\nnote n1 "memo" {\n  attach shared.psp\n}\n',
  },
  { name: 'flow-minimal-msg', src: 'pcd 1.0\nperson a "A"\nperson b "B"\nflow {\n a -> b\n}\n' },
  {
    name: 'layout-full',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b
layout auto LR
layout saved
hide a
hide tag admin
position a (10, 20)
position b (10, 20)
pin b
`,
  },
  {
    name: 'style-stmt',
    src: `pcd 1.0
person a "A"
style a {
  fill #abcdef
  shape rounded
  glow "x"
}
`,
  },
  { name: 'empty-style-block-omitted', src: 'pcd 1.0\nperson a "A" {\n  style {\n  }\n}\n' },
  { name: 'import', src: 'pcd 1.0\nimport auth as "../auth/auth.pcd"\n' },
  {
    name: 'color-vs-comment',
    src: `pcd 1.0
person a "A" {
  style {
    fill #f00
  }
}
# not a color
`,
  },
  { name: 'empty-strings', src: `pcd 1.0\ntitle ""\nimport i0 as ""\nperson a "" {\n  description ""\n  property k ""\n}\nperson b "B"\na -> b\nflow "" {\n  intro ""\n  a -> b : ""\n  alt "" {\n    "" {\n      process a ""\n    }\n  }\n}\n` },
  { name: 'goto-empty-parts', src: 'pcd 1.0\nflow {\n goto "#f"\n goto "f#"\n}\n' },
  // --- document icons (IR v9, FILE-FORMAT §3.1) ---
  {
    name: 'icons-full',
    src: `pcd 1.0
icon brand {
  label "Company mark"
  media "image/svg+xml"
  data "${SVG_SQUARE}"
}
icon badge {
  media "image/svg+xml"
  data "${SVG_CIRCLE}"
}
# a comment that belongs to the object, not the icon above it
system api "API" {
  icon brand
}
system web "Web" {
  icon badge
}
`,
  },
  {
    name: 'icon-comments-and-order',
    src: `pcd 1.0
# leading comment
icon mark {
  data "${SVG_SQUARE}"
  media "image/svg+xml"
  label "Mark"
}
`,
  },
  {
    name: 'icon-duplicate-handle',
    src: `pcd 1.0
icon dup {
  media "image/svg+xml"
  data "${SVG_SQUARE}"
}
icon dup {
  media "image/svg+xml"
  data "${SVG_CIRCLE}"
}
`,
  },
  {
    name: 'icon-builtin-collision',
    src: `pcd 1.0
icon cloud {
  media "image/svg+xml"
  data "${SVG_SQUARE}"
}
person p "P" {
  icon cloud
}
`,
  },
  {
    name: 'icon-unsafe-svg',
    src: `pcd 1.0
icon evil {
  media "image/svg+xml"
  data "${SVG_EVIL}"
}
person p "P" {
  icon evil
}
`,
  },
  { name: 'icon-unknown-ref', src: 'pcd 1.0\nperson p "P" {\n  icon nope\n}\n' },
  {
    name: 'icon-unsupported-media',
    src: `pcd 1.0
icon pic {
  media "image/png"
  data "${SVG_SQUARE}"
}
`,
  },
  { name: 'icon-bad-base64', src: 'pcd 1.0\nicon bad {\n  media "image/svg+xml"\n  data "not base64!"\n}\n' },
  { name: 'icon-missing-media', src: 'pcd 1.0\nicon m {\n  data "AAAA"\n}\n' },
  { name: 'icon-missing-data', src: 'pcd 1.0\nicon m {\n  media "image/svg+xml"\n}\n' },
  { name: 'icon-unknown-line', src: 'pcd 1.0\nicon m {\n  sparkle yes\n}\n' },
  { name: 'icon-duplicate-line', src: 'pcd 1.0\nicon m {\n  media "image/svg+xml"\n  media "image/svg+xml"\n}\n' },
  { name: 'icon-unclosed', src: 'pcd 1.0\nicon m {\n  media "image/svg+xml"\n' },
  // --- error cases (doc = null; lexer-only errors keep the doc) ---
  { name: 'missing-magic', src: 'person a "A"\n' },
  { name: 'unsupported-major', src: 'pcd 2.0\n' },
  { name: 'duplicate-magic', src: 'pcd 1.0\npcd 1.0\n' },
  { name: 'stray-close', src: 'pcd 1.0\n}\n' },
  { name: 'unclosed-object', src: 'pcd 1.0\nperson a "A" {\n description "x"\n' },
  { name: 'unclosed-flow', src: 'pcd 1.0\nflow {\n intro "x"\n' },
  { name: 'unclosed-alt-branch', src: 'pcd 1.0\nflow {\n alt {\n "a" {\n info "x"\n' },
  { name: 'unclosed-par-lane', src: 'pcd 1.0\nflow {\n par {\n {\n info "x"\n' },
  { name: 'legacy-view', src: 'pcd 1.0\nview "v" {\n pin a\n}\n' },
  { name: 'duplicate-attr', src: 'pcd 1.0\nperson a "A" {\n icon x\n icon y\n' },
  { name: 'arrow-needs-head', src: 'pcd 1.0\nperson a "A"\nperson b "B"\na - b\n' },
  { name: 'stray-lt', src: 'pcd 1.0\nperson a "A"\n<\n' },
  { name: 'unterminated-string', src: 'pcd 1.0\ntitle "abc\n' },
  { name: 'invalid-escape', src: 'pcd 1.0\ntitle "a\\nb"\n' },
  { name: 'ident-too-long', src: `pcd 1.0\n${'a'.repeat(65)} "A"\n` },
  { name: 'invalid-color', src: 'pcd 1.0\nperson a "A" {\n style {\n  fill red\n }\n}\n' },
  { name: 'nesting-too-deep', src: `pcd 1.0\nflow {\n${deepNest(33)}\n}\n` },
  { name: 'invalid-goto', src: 'pcd 1.0\nflow {\n goto 5\n}\n' },
  { name: 'goto-bad-return', src: 'pcd 1.0\nperson a "A"\nflow {\n goto x return sideways\n}\n' },
  { name: 'bad-number-in-flow', src: 'pcd 1.0\nperson a "A"\nflow {\n 5\n}\n' },
  { name: 'bad-layout-mode', src: 'pcd 1.0\nlayout zoomy\n' },
  { name: 'hide-missing-id', src: 'pcd 1.0\nhide 5\n' },
  { name: 'legacy-drilldown-view', src: 'pcd 1.0\nsystem s "S" {\n drilldown "c.pcd" view detail\n}\n' },
  // --- semantic validation cases ---
  {
    name: 'dup-ids',
    src: `pcd 1.0
person a "A"
person a "A2"
flow "f" as f1 {
 info "x"
}
flow "g" as f1 {
 info "y"
}
`,
  },
  {
    name: 'unknown-endpoints',
    src: 'pcd 1.0\nperson a "A"\na -> ghost\nflow {\n a -> b\n process ghost2\n}\n',
  },
  {
    name: 'contains-rules',
    src: `pcd 1.0
container app "App" {
 contains ghost
}
group g "G" {
 contains app
}
group g2 "G2" {
 contains g
}
`,
  },
  { name: 'attach-unknown', src: 'pcd 1.0\nnote n "N" {\n attach ghost\n}\n' },
  { name: 'p205-raw-attrs', src: 'pcd 1.0\nperson a "A" {\n blur "2px"\n}\nperson b "B"\na -> b {\n glow "on"\n}\n' },
  { name: 'msg-link-ref-missing', src: 'pcd 1.0\nperson a "A"\nperson b "B"\nflow {\n a -> b as nolink\n}\n' },
  { name: 'alias-orphan-skip', src: 'pcd 1.0\nimport auth as "auth.pcd"\nperson auth "Auth"\n' },
  {
    name: 'clean-doc',
    src: `pcd 1.0
title "Clean"
level container
person u "User"
system web "Web"
system db "DB" {
  technology "Postgres"
}
u -> web : "browse"
web -> db : "query" as q
flow "Main" as main {
  intro "start"
  u -> web
  web -> db as q
}
position u (0, 0)
position web (100, 0)
position db (200, 0)
style u {
  shape person
}
`,
  },
  // IR v10: C4 decomposition and embedded source (FILE-FORMAT §3.2, §3.3).
  {
    name: 'drilldown-plain-named',
    src: `pcd 1.0
system shop "Webshop" {
  drilldown "containers/shop.pcd"
}
`,
  },
  {
    name: 'drilldown-plain',
    src: `pcd 1.0
container api "API" {
  drilldown "../components/api.pcd"
}
`,
  },
  {
    name: 'source-block',
    src: `pcd 1.0
container api "API" {
  source {
    language "go"
    text "func Charge() error {"
    text "\\treturn nil"
    text "}"
  }
}
`,
  },
  {
    // Order-free lines, canonical print is language first; empty lines survive.
    name: 'source-order-free',
    src: `pcd 1.0
component svc "Svc" {
  source {
    text ""
    text "a \\"quoted\\" line"
    language "ts"
    text "b"
  }
}
`,
  },
  {
    // IR v12: linked and embedded decomposition targets are distinct values.
    name: 'decomposition-embedded',
    src: `pcd 1.0
system shop "Webshop" {
  drilldown embedded "containers/shop.pcd" {
    pcd 1.0
    title "Containers"
    level container
    container api "API" {
      drilldown "components/api.pcd"
      source {
        language "go"
        text "func Run() {}"
      }
    }
  }
}
`,
  },
  {
    // A source block without a text line is E116 (nothing to show or print).
    name: 'source-empty',
    src: `pcd 1.0
system a "A" {
  source {
    language "go"
  }
}
`,
  },
  {
    // Duplicate attributes are E110 on both sides of the parity fixture.
    name: 'drilldown-duplicate',
    src: `pcd 1.0
system a "A" {
  drilldown "a.pcd"
  drilldown "b.pcd"
}
`,
  },
  {
    // P215: only C4 elements decompose — a person cannot own a child diagram.
    name: 'drilldown-unsupported-kind',
    src: `pcd 1.0
person u "User" {
  drilldown "u.pcd"
}
`,
  },
  {
    // P213: a non-.pcd target is rejected by validation, not by the grammar.
    name: 'drilldown-not-pcd',
    src: `pcd 1.0
system s "S" {
  drilldown "notes.md"
}
`,
  },
  {
    // Flow notes are one multiline block plus the persisted presentation flag;
    // the legacy one-line description stays valid. Both sides must agree.
    name: 'flow-notes',
    src: `pcd 1.0
flow "Notes" as n {
  description {
    text "# Title"
    text ""
    text "**Bold** [link](https://example.test/)"
  }
  presentation
  info "one"
}
flow "Legacy" as legacy {
  description "one line"
  info "start"
}
`,
  },
  { name: 'flow-notes-empty', src: 'pcd 1.0\nflow "F" {\n  description {\n  }\n}\n' },
  {
    // Step prose covers the same ground: framing steps, a process note and the
    // step description may each be a block of text lines.
    name: 'flow-step-text',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b as ab
flow "Step prose" as sp {
  intro {
    text "# Start"
    text ""
    text "**Go** left to right."
  }
  a -> b : "order" presentation {
    description {
      text "Two systems."
      text ""
      text "- send"
      text "- accept"
    }
    camera hold
  }
  process b {
    text "Accept the order"
  } delay 900
  conclusion "the end"
}
`,
  },
  { name: 'flow-step-text-empty', src: 'pcd 1.0\nflow "F" {\n  intro {\n  }\n}\n' },
  {
    // Atomic forms: mixing a legacy description with a multiline block aborts.
    name: 'flow-notes-mixed',
    src: 'pcd 1.0\nflow "F" {\n  description "one"\n  description {\n    text "two"\n  }\n}\n',
  },
];

const run = (c: Case): FXCase => {
  const { doc, diagnostics } = parsePDL(c.src);
  return {
    name: c.name,
    src: c.src,
    doc: doc === null ? null : serializeDoc(doc),
    print: doc === null ? null : printDoc(doc),
    parseDiags: diagnostics,
    validateDiags: doc === null ? [] : validateDoc(doc),
  };
};

const build = (): FX => ({ version: 1, cases: CASES.map(run) });

describe('TS⇄Go parity fixture (M1-WP7)', () => {
  if (process.env['CORPUS_FIXTURE'] === '1') {
    it('regenerates testdata/pdl-cases.json from the TS engine', () => {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(build(), null, 2)}\n`);
    });
    return;
  }
  it('committed fixture matches the current TS engine', () => {
    const fx = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FX;
    expect(fx).toEqual(build());
  });
});
