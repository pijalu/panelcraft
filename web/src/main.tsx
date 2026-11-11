// SPDX-License-Identifier: GPL-3.0-only
import { render } from 'preact';
import { App } from './ui/App';
import { registerServiceWorker } from './sw-register';
import { renderDiagram } from './cliRender';
import './ui/app.css';

if (new URLSearchParams(window.location.search).has('cli-render')) {
  // Go's headless CLI drives this isolated, storage-free entry point.
  Object.assign(window, { panelcraftRender: renderDiagram });
} else {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app mount point missing');
  render(<App />, root);
  registerServiceWorker();
}
