import type { Theme } from './index.ts';

/** Darkroom — from docs/Styles and themes/. Sharp, restrained, technical. */
export const darkroom: Theme = {
  id: 'darkroom',
  name: 'Darkroom',
  description: 'Dark, sharp and restrained, so your images stand out.',
  vars: {
    '--bg': '#121212',
    '--bg2': '#0b0b0b',
    '--surface': '#1b1b1a',
    '--surface2': '#262625',
    '--line': '#363631',
    '--text': '#f3f2ec',
    '--text2': '#9a9990',
    '--accent': '#ff4b2b',
    '--accent2': '#f2e34b',
    '--accent-ink': '#0b0b0b',
    '--red': '#ff3d5a',
    '--amber': '#ffb020',
    '--blue': '#58a6ff',
    '--thumb': '#0e0e0e',
    '--scrim': 'rgba(11, 11, 11, 0.8)',
    '--radius': '2px',
    '--font-ui': "Bahnschrift, 'DIN Alternate', 'Segoe UI', system-ui, sans-serif",
    '--font-mono': "'Cascadia Mono', Consolas, monospace",
    '--label-spacing': '0.08em',
  },
};
