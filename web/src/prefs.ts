import type { SortKey } from '@media-view/shared';

/**
 * Preferences kept in this browser (localStorage): grids open with the grid ones — changing them on
 * a grid changes them here too — and the slideshow uses the viewer ones. Settings edits them all.
 */

export const DEFAULTS = {
  'grid.cols': 6,
  'grid.sort': 'name' as SortKey,
  'grid.order': 'asc' as 'asc' | 'desc',
  'grid.group': 'none' as GroupKey,
  'grid.index': true,
  'viewer.interval': 5,
  'viewer.loop': true,
  'viewer.shuffle': false,
};

export type PrefKey = keyof typeof DEFAULTS;

export type GroupKey = 'none' | 'collection' | 'format';

/** The remembered grouping (it was a yes / no for collections before Group by format). */
export const groupPref = (v: unknown): GroupKey => (v === true ? 'collection' : v === 'collection' || v === 'format' ? v : 'none');

/** The slideshow intervals, in seconds: Settings offers these, and the viewer's ‹ › step through them. */
export const INTERVALS = [2, 3, 5, 8, 10, 15, 20, 30];

export function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: preferences just aren't remembered
  }
}

export const pref = <K extends PrefKey>(key: K): (typeof DEFAULTS)[K] =>
  (key === 'grid.group' ? groupPref(stored<unknown>(key, DEFAULTS[key])) : stored(key, DEFAULTS[key])) as (typeof DEFAULTS)[K];
