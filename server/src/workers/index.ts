import { emit } from '../lib/events.ts';
import { setLibraryHooks } from '../services/library.ts';
import { startThumbnails, stopThumbnails } from '../services/thumbnails.ts';
import { startHasher, stopHasher } from './hasher.ts';
import { requestScan, resetScanner } from './scanner.ts';

/** Start the background workers for whichever library is open (technical doc §3). */
export function installWorkers(): void {
  setLibraryHooks({
    opened(lib) {
      startThumbnails(lib);
      startHasher(lib);
      // The UI is usable right away with what the DB knows; the scan refreshes it.
      requestScan(lib);
      emit({ type: 'library-changed' });
    },
    closing() {
      stopHasher();
      stopThumbnails();
      resetScanner();
    },
  });
}
