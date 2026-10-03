import { darkroom } from './darkroom.ts';

/** Themes are data: applying one writes its vars onto :root (technical doc §13.4). */
export interface Theme {
  id: string;
  name: string;
  description: string;
  vars: Record<`--${string}`, string>;
}

export const themes: Theme[] = [darkroom];

export function applyTheme(id: string): Theme {
  const theme = themes.find((t) => t.id === id) ?? darkroom;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
  root.dataset.theme = theme.id;
  return theme;
}

/** Style mockups shown by the Check styles dialog (docs/styles.md §1). */
export const styleMockups = [
  { id: 'darkroom', name: 'Darkroom', note: 'Current style' },
  { id: 'mochi', name: 'Mochi', note: 'Soft and playful' },
  { id: 'scriptorium', name: 'Scriptorium', note: 'Old manuscript' },
  { id: 'sticker-riot', name: 'Sticker Riot', note: 'Loud and graphic' },
] as const;
