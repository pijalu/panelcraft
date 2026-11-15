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
    name: 'view-full',
    src: `pcd 1.0
person a "A"
person b "B"
a -> b
view "Main" as main {
  layout auto LR
  layout saved
  hide a
  hide tag admin
  position a (10, 20)
  position b (10, 20)
  pin b
}
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
  { name: 'empty-strings', src: `pcd 1.0\ntitle ""\nimport i0 as ""\nperson a "" {\n  description ""\n  property k ""\n}\nperson b "B"\na -> b\nflow "" {\n  intro ""\n  a -> b : ""\n  alt "" {\n    "" {\n      process a ""\n    }\n  }\n}\nview "" {\n}\n` },
  { name: 'goto-empty-parts', src: 'pcd 1.0\nflow {\n goto "#f"\n goto "f#"\n}\n' },
  // --- error cases (doc = null; lexer-only errors keep the doc) ---
  { name: 'missing-magic', src: 'person a "A"\n' },
  { name: 'unsupported-major', src: 'pcd 2.0\n' },
  { name: 'duplicate-magic', src: 'pcd 1.0\npcd 1.0\n' },
  { name: 'stray-close', src: 'pcd 1.0\n}\n' },
  { name: 'unclosed-object', src: 'pcd 1.0\nperson a "A" {\n description "x"\n' },
  { name: 'unclosed-flow', src: 'pcd 1.0\nflow {\n intro "x"\n' },
  { name: 'unclosed-alt-branch', src: 'pcd 1.0\nflow {\n alt {\n "a" {\n info "x"\n' },
  { name: 'unclosed-par-lane', src: 'pcd 1.0\nflow {\n par {\n {\n info "x"\n' },
  { name: 'unclosed-view', src: 'pcd 1.0\nview "v" {\n pin a\n' },
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
  { name: 'bad-view-line', src: 'pcd 1.0\nview "v" {\n zoom 2\n}\n' },
  { name: 'bad-layout-mode', src: 'pcd 1.0\nview "v" {\n layout zoomy\n}\n' },
  { name: 'hide-missing-id', src: 'pcd 1.0\nview "v" {\n hide 5\n}\n' },
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
view "v1" as v1 {
 layout saved
}
view "v2" as v1 {
 layout saved
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
view "V" {
  position u (0, 0)
  position web (100, 0)
  position db (200, 0)
}
style u {
  shape person
}
`,
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
