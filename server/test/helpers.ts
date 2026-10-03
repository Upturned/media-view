import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A fresh temp dir; also points the app-data dir at it so tests never touch %APPDATA%. */
export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-view-test-'));
  process.env.MEDIA_VIEW_APPDATA = path.join(dir, 'appdata');
  return dir;
}
