// SPDX-License-Identifier: GPL-3.0-only
import { render } from 'preact';
import { App } from './ui/App';
import './ui/app.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app mount point missing');

render(<App />, root);
