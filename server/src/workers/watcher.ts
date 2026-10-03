import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { isExpected } from '../lib/expected.ts';
import { log } from '../lib/log.ts';
import type { OpenLibrary } from '../services/library.ts';
import { requestScan } from './scanner.ts';

/**
 * Live reconciliation while the app is open (technical doc §7.5): changes made in Explorer
 * trigger a scan once things settle. The app's own changes are ignored (lib/expected.ts).
 */

const DEBOUNCE_MS = 1000;

let watcher: FSWatcher | null = null;
let timer: NodeJS.Timeout | null = null;

export function startWatcher(lib: OpenLibrary): void {
  stopWatcher();
  const root = lib.moduleRoot('images');
  watcher = watch(root, {
    ignoreInitial: true,
    // Hidden entries (markers included) are the app's business; partially copied files wait.
    ignored: (p) => path.basename(p).startsWith('.') && p !== root,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  });
  watcher.on('all', (_event, changed) => {
    if (isExpected(changed)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      requestScan(lib);
    }, DEBOUNCE_MS);
  });
  watcher.on('error', (err) => log('warn', 'watcher', 'watcher error', { message: (err as Error).message }));
}

export function stopWatcher(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  void watcher?.close();
  watcher = null;
}
