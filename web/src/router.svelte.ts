/**
 * Hash-based router (`#/…`), so the same build works over http and inside Electron.
 * Routes are added here as pages are built (technical doc §13.1).
 */

export type RouteName =
  | 'hub' | 'images' | 'folder' | 'album' | 'all' | 'viewer' | 'search' | 'tags' | 'tag-types' | 'tag' | 'wiki' | 'favorites'
  | 'collections' | 'collection' | 'health' | 'health-review' | 'health-untagged' | 'health-grid' | 'recycle' | 'settings' | 'not-found';

const ROUTES: [pattern: string, name: RouteName][] = [
  ['/', 'hub'],
  ['/images', 'images'],
  ['/images/f/:id', 'folder'],
  ['/images/f/:id/all', 'all'],
  ['/images/a/:id', 'album'],
  ['/images/v/:id', 'viewer'],
  ['/search', 'search'],
  ['/tags', 'tags'],
  ['/tag-types', 'tag-types'],
  ['/tags/:id', 'wiki'],
  ['/tags/:id/images', 'tag'],
  ['/favorites', 'favorites'],
  ['/collections', 'collections'],
  ['/collections/:id', 'collection'],
  ['/health', 'health'],
  ['/health/review/:section', 'health-review'],
  ['/health/untagged', 'health-untagged'],
  ['/health/untagged/grid', 'health-grid'],
  ['/recycle', 'recycle'],
  ['/settings', 'settings'],
];

export interface Route {
  name: RouteName;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

function match(hash: string): Route {
  const [rawPath = '/', rawQuery = ''] = hash.replace(/^#/, '').split('?');
  const path = '/' + rawPath.split('/').filter(Boolean).join('/');
  const query = new URLSearchParams(rawQuery);
  const parts = path.split('/').filter(Boolean);

  for (const [pattern, name] of ROUTES) {
    const want = pattern.split('/').filter(Boolean);
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = want.every((seg, i) => {
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]!);
        return true;
      }
      return seg === parts[i];
    });
    if (ok) return { name, path, params, query };
  }
  return { name: 'not-found', path, params: {}, query };
}

export const router = $state({ route: match(location.hash) });

/**
 * Each history entry of the app carries its position (`idx`), so "back" knows whether there is an
 * app page to go back to — also after replace-navigations and the browser's own back/forward.
 */
let index = (history.state as { idx?: number } | null)?.idx ?? 0;
let replacing = false;
if ((history.state as { idx?: number } | null)?.idx === undefined) history.replaceState({ idx: 0 }, '');

window.addEventListener('hashchange', () => {
  const known = (history.state as { idx?: number } | null)?.idx;
  if (known !== undefined) index = known;
  else {
    if (!replacing) index++;
    history.replaceState({ idx: index }, '');
  }
  replacing = false;
  router.route = match(location.hash);
});

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const hash = '#' + path.replace(/^#/, '');
  if (opts.replace) {
    replacing = true;
    location.replace(hash);
  } else location.hash = hash;
}

/** Back to the previous page of the app, or to `fallback` when there's none (e.g. opened by URL). */
export function goBack(fallback: string): void {
  if (index > 0) history.back();
  else navigate(fallback);
}

export const href = (path: string) => '#' + path;

export const folderHref = (f: { id: number; kind: string }) =>
  href(f.kind === 'album' || f.kind === 'inbox' ? `/images/a/${f.id}` : `/images/f/${f.id}`);
