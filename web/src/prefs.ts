import type { SortKey } from '@media-view/shared';

/**
 * Preferences: grids open with the grid ones — changing them on a grid changes them here too — and
 * the slideshow uses the viewer ones. Settings edits them all. While a profile is in use they're the
 * profile's (docs/profiles.md §3), saved with it; the rest (a collection list's sort…) stay in this
 * browser (localStorage).
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

/** Keys that belong to the profile; anything else stays in this browser. */
const PROFILE_KEYS = new Set<string>([...Object.keys(DEFAULTS), 'theme']);

/** The profile's preferences and how to save one (set by the profile store); null before a profile is in use. */
let profile: { prefs: Record<string, unknown>; save: (key: string, value: unknown) => void } | null = null;

export function useProfilePrefs(prefs: Record<string, unknown> | null, save: (key: string, value: unknown) => void): void {
  profile = prefs ? { prefs, save } : null;
}

/** Everything this browser kept, for the one-time hand-over to the first profile (docs/profiles.md §6.1). */
export function browserPrefs(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULTS)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) out[key] = key === 'grid.group' ? groupPref(JSON.parse(raw)) : JSON.parse(raw);
    } catch {
      // unreadable: left out
    }
  }
  return out;
}

export function stored<T>(key: string, fallback: T): T {
  if (profile && PROFILE_KEYS.has(key)) return key in profile.prefs ? (profile.prefs[key] as T) : fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function store(key: string, value: unknown): void {
  if (profile && PROFILE_KEYS.has(key) && profile.prefs[key] !== value) {
    profile.prefs[key] = value;
    profile.save(key, value);
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: preferences just aren't remembered
  }
}

export const pref = <K extends PrefKey>(key: K): (typeof DEFAULTS)[K] =>
  (key === 'grid.group' ? groupPref(stored<unknown>(key, DEFAULTS[key])) : stored(key, DEFAULTS[key])) as (typeof DEFAULTS)[K];
