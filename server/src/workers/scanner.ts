import type { ScanStatus } from '@media-view/shared';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { getLibrary, type OpenLibrary } from '../services/library.ts';
import { reconcile, type ReconcileResult } from '../services/reconcile.ts';
import { kickHasher, pendingHashes } from './hasher.ts';

/** Runs reconciliation one at a time; a request during a scan schedules one more pass after it. */

let running = false;
let again = false;
let lastScan: number | null = null;
let lastResult: ReconcileResult | null = null;

export function requestScan(lib: OpenLibrary): void {
  if (running) {
    again = true;
    return;
  }
  running = true;
  emit({ type: 'scan', status: 'scanning' });
  void (async () => {
    try {
      do {
        again = false;
        lastResult = await reconcile(lib);
        lastScan = Date.now();
      } while (again && getLibrary() === lib);
    } catch (err) {
      if (getLibrary() === lib) log('error', 'scan', 'reconciliation failed', { message: (err as Error).message, stack: (err as Error).stack });
    } finally {
      running = false;
      emit({ type: 'scan', status: 'idle' });
      if (getLibrary() === lib) {
        emit({ type: 'folders-changed' });
        emit({ type: 'files-changed' });
        emit({ type: 'health-changed' });
        kickHasher();
      }
    }
  })();
}

export function resetScanner(): void {
  again = false;
  lastScan = null;
  lastResult = null;
}

export function scanStatus(lib: OpenLibrary): ScanStatus {
  return { status: running ? 'scanning' : 'idle', lastScan, hashing: pendingHashes(lib) };
}

export function lastScanResult(): ReconcileResult | null {
  return lastResult;
}
