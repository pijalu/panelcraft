// SPDX-License-Identifier: GPL-3.0-only
// Template gallery (F-25, paradox of the active user): a brand-new file is not
// an empty grey void but four ways to get started — three worked examples and a
// blank canvas for a user who already knows what they want to draw.
import type { ComponentChildren } from 'preact';
import { s } from './strings';

export interface Template {
  id: string;
  title: string;
  hint: string;
  text: string;
}

/**
 * The document a blank choice seeds: the format's magic line and nothing else.
 * It parses, prints unchanged, and carries no shape, connection or flow — so the
 * canvas is free for keyboard placement and the code view is free for typing.
 */
export const BLANK_TEXT = 'pcd 1.0\n';

export const TEMPLATES: Template[] = [
  {
    id: 'c4',
    title: s('C4 context'),
    hint: s('Two systems, one person, two links'),
    text: `pcd 1.0

person user "Customer"
system app "Shop"
system_ext pay "Payment provider"

user -> app : "buys"
app -> pay : "charges"
`,
  },
  {
    id: 'flow',
    title: s('Flow'),
    hint: s('A request/response flow you can play'),
    text: `pcd 1.0

system web "Web app"
system api "API"

web -> api : "POST /checkout"
api -> web : "201 Created"
`,
  },
  {
    id: 'mermaid',
    title: s('From mermaid'),
    hint: s('Paste a flowchart and keep editing'),
    text: `pcd 1.0

system a "Service A"
system b "Service B"

a -> b
`,
  },
];

/**
 * Whether the gallery should be shown from the document alone: an empty canvas
 * and no authored line. The header magic line does not count as authorship —
 * opening an empty file already puts the canvas projection of a blank document
 * into the code view, so a header-only file is still unanswered.
 */
export function galleryVisible(objectCount: number, codeText: string): boolean {
  return objectCount === 0 && !hasAuthoredLine(codeText);
}

/** True when the text holds a line that says something beyond the magic line. */
function hasAuthoredLine(codeText: string): boolean {
  return codeText.split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && trimmed !== 'pcd 1.0';
  });
}

export function EmptyState(props: {
  onInsert: (template: Template) => void;
  /** Blank means "insert nothing": its own callback, never a template. */
  onBlank: () => void;
}): ComponentChildren {
  return (
    <div class="empty-state" data-testid="empty-state">
      <h2 class="empty-title">{s("Start from a template")}</h2>
      <ul class="empty-list">
        <li key="blank">
          <button
            type="button"
            class="empty-card"
            data-testid="template-blank"
            onClick={() => props.onBlank()}
          >
            <strong>{s('Blank diagram')}</strong>
            <span class="muted">{s('An empty canvas you fill yourself')}</span>
          </button>
        </li>
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              class="empty-card"
              data-testid={`template-${t.id}`}
              onClick={() => props.onInsert(t)}
            >
              <strong>{t.title}</strong>
              <span class="muted">{t.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <p class="muted">
        {s("…or press")}{' '}<kbd>{s("1")}</kbd>{s("–")}<kbd>{s("9")}</kbd> {s("to place a shape, or type in the code view.")}{' '}</p>
    </div>
  );
}

/** Gate + wiring for the gallery: shows only for an unauthored, empty file. */
export function TemplateOverlay(props: {
  show: boolean;
  onInsert: (template: Template) => void;
  onBlank: () => void;
}): ComponentChildren {
  return props.show ? <EmptyState onInsert={props.onInsert} onBlank={props.onBlank} /> : null;
}
