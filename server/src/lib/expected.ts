import path from 'node:path';

/**
 * Disk changes the app makes itself. The watcher ignores events under these paths for a few
 * seconds, so the app's own operations don't trigger a redundant scan (technical doc §7.3).
 */

const TTL_MS = 5000;
const entries = new Map<string, number>();

const norm = (p: string) => path.resolve(p).toLowerCase();

export function expectChange(...paths: string[]): void {
  const until = Date.now() + TTL_MS;
  for (const p of paths) entries.set(norm(p), until);
}

export function isExpected(p: string): boolean {
  const target = norm(p);
  const now = Date.now();
  for (const [prefix, until] of entries) {
    if (until < now) {
      entries.delete(prefix);
      continue;
    }
    if (target === prefix || target.startsWith(prefix + path.sep)) return true;
  }
  return false;
}
