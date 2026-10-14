import fs from 'node:fs';
import path from 'node:path';
import { conflict } from './errors.ts';

/**
 * fs.renameSync that waits out Windows' short-lived locks. A folder or file someone is reading
 * (Explorer's preview, an antivirus scan, the thumbnailer, the watcher) refuses a rename with
 * EPERM / EBUSY / EACCES for a moment; a few retries over about a second ride that out. A lock that
 * stays (an Explorer window open inside the folder, a program with the file open) becomes a 409
 * with a message the user can act on, instead of the raw error.
 */

const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES']);
const WAITS_MS = [50, 100, 200, 300, 400];

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!LOCKED.has(code)) throw err;
      if (attempt >= WAITS_MS.length) throw inUse(from, err as Error);
      pause(WAITS_MS[attempt]!);
    }
  }
}

function inUse(from: string, cause: Error): Error {
  let folder = false;
  try {
    folder = fs.statSync(from).isDirectory();
  } catch {
    // Gone meanwhile: report it as a file.
  }
  const name = path.basename(from);
  const error = conflict(
    'IN_USE',
    folder
      ? `Windows won’t let the app rename or move “${name}”: something is using it. Close any Explorer window or program open inside it, then try again.`
      : `Windows won’t let the app rename or move “${name}”: another program has it open. Close it, then try again.`,
  );
  error.cause = cause;
  return error;
}
