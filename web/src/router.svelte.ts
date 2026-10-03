/**
 * Hash-based router (`#/…`), so the same build works over http and inside Electron.
 * Routes are added here as pages are built (technical doc §13.1).
 */

export type RouteName = 'hub' | 'images' | 'settings' | 'not-found';

const ROUTES: [pattern: string, name: RouteName][] = [
  ['/', 'hub'],
  ['/images', 'images'],
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

window.addEventListener('hashchange', () => {
  router.route = match(location.hash);
});

export function navigate(path: string): void {
  location.hash = '#' + path;
}

export const href = (path: string) => '#' + path;
