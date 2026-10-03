import { mount } from 'svelte';
import App from './App.svelte';
import './base.css';
import { applyTheme } from './themes/index.ts';

applyTheme('darkroom');

mount(App, { target: document.getElementById('app')! });
