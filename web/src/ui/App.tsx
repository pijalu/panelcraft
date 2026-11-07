// SPDX-License-Identifier: GPL-3.0-only
import './app.css';

/** M0 scaffold app: empty state shell. Real workspace UI lands in M2/M3. */
export function App() {
  return (
    <div class="app-shell" data-testid="app-shell">
      <header class="app-title">PanelCraft</header>
      <main class="empty-state">
        <p>Architecture diagrams, in your browser.</p>
        <p class="muted">
          Scaffolding milestone M0 — canvas, code view and workspace arrive with
          milestones M1–M4.
        </p>
      </main>
    </div>
  );
}
