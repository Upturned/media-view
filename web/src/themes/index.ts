import { darkroom } from './darkroom.ts';

/** Themes are data: applying one writes its vars onto :root (technical doc §13.4). */
export interface Theme {
  id: string;
  name: string;
  description: string;
  vars: Record<`--${string}`, string>;
  /** The style's own words for things (docs/styles.md §1.1); plain words are the fallback. */
  words?: Partial<Record<WordKey, string>>;
}

/** Plain words, as used in the docs and Help. */
export const PLAIN_WORDS = {
  category: 'Category',
  categories: 'Categories',
  subcategory: 'Sub-category',
  subcategories: 'Sub-categories',
  album: 'Album',
  albums: 'Albums',
  image: 'image',
  images: 'images',
} as const;

export type WordKey = keyof typeof PLAIN_WORDS;

export const themes: Theme[] = [darkroom];

let current: Theme = darkroom;

export function applyTheme(id: string): Theme {
  current = themes.find((t) => t.id === id) ?? darkroom;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(current.vars)) root.style.setProperty(name, value);
  root.dataset.theme = current.id;
  return current;
}

/** The current style's word for something (e.g. Darkroom: category → "Rack"). */
export function word(key: WordKey): string {
  return current.words?.[key] ?? PLAIN_WORDS[key];
}

/** Whether the style renames this (then the plain word is shown next to it). */
export function isStyled(key: WordKey): boolean {
  return word(key).toLowerCase() !== PLAIN_WORDS[key].toLowerCase();
}

/** Style mockups shown by the Check styles dialog (docs/styles.md §1). */
export const styleMockups = [
  { id: 'darkroom', name: 'Darkroom', note: 'Current style' },
  { id: 'mochi', name: 'Mochi', note: 'Soft and playful' },
  { id: 'scriptorium', name: 'Scriptorium', note: 'Old manuscript' },
  { id: 'sticker-riot', name: 'Sticker Riot', note: 'Loud and graphic' },
] as const;
