import { emit } from '../lib/events.ts';
import { setLibraryHooks } from '../services/library.ts';
import { startPreviews, stopPreviews } from '../services/previews.ts';
import { startThumbnails, stopThumbnails } from '../services/thumbnails.ts';
import { startHasher, stopHasher } from './hasher.ts';
import { requestScan, resetScanner } from './scanner.ts';
import { startWatcher, stopWatcher } from './watcher.ts';

/** Start the background workers for whichever library is open (technical doc §3). */
export function installWorkers(): void {
  setLibraryHooks({
    opened(lib) {
      startThumbnails(lib);
      startPreviews(lib);
      startHasher(lib);
      // The UI is usable right away with what the DB knows; the scan refreshes it.
      requestScan(lib);
      startWatcher(lib);
      emit({ type: 'library-changed' });
    },
    closing() {
      stopWatcher();
      stopHasher();
      stopThumbnails();
      stopPreviews();
      resetScanner();
    },
  });
}
