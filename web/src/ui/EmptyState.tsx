// SPDX-License-Identifier: GPL-3.0-only
// Template gallery (F-25, paradox of the active user): a brand-new file is not
// an empty grey void but three ways to get started.
import type { ComponentChildren } from 'preact';
import { s } from './strings';

export interface Template {
  id: string;
  title: string;
  hint: string;
  text: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'c4',
    title: s('C4 context'),
    hint: s('Two systems, one person, one link'),
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

flow "Checkout" as checkout {
  web -> api : "POST /checkout"
  api -> web : "201 Created"
}
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

export function EmptyState(props: {
  onInsert: (template: Template) => void;
}): ComponentChildren {
  return (
    <div class="empty-state" data-testid="empty-state">
      <h2 class="empty-title">{s("Start from a template")}</h2>
      <ul class="empty-list">
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

/** Gate + wiring for the gallery: shows only for an empty canvas. */
export function TemplateOverlay(props: {
  show: boolean;
  onInsert: (template: Template) => void;
}): ComponentChildren {
  return props.show ? <EmptyState onInsert={props.onInsert} /> : null;
}
