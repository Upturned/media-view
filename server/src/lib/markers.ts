import fs from 'node:fs';
import path from 'node:path';
import type { FolderKind } from '@media-view/shared';
import { hide } from './windows.ts';

/** Hidden identity file in every folder (technical doc §7.1). */

export const MARKER_FILES: Record<FolderKind, string> = {
  category: '.category',
  subcategory: '.subcategory',
  album: '.album',
  inbox: '.inbox',
};

export const MARKER_NAMES = new Set(Object.values(MARKER_FILES));

export interface Marker {
  kind: FolderKind;
  library: string;
  folder: string;
}

export function writeMarker(dir: string, kind: FolderKind, libraryId: string, folderUuid: string): void {
  for (const [k, name] of Object.entries(MARKER_FILES)) {
    if (k !== kind) fs.rmSync(path.join(dir, name), { force: true });
  }
  const file = path.join(dir, MARKER_FILES[kind]);
  // A hidden file can't be overwritten with writeFileSync on Windows; remove it first.
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, JSON.stringify({ v: 1, library: libraryId, folder: folderUuid }) + '\n');
  hide(file);
}

/** The folder's marker, or null if there is none or it's unreadable. */
export function readMarker(dir: string): Marker | null {
  for (const [kind, name] of Object.entries(MARKER_FILES) as [FolderKind, string][]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { library?: unknown; folder?: unknown };
      if (typeof data.library === 'string' && typeof data.folder === 'string') {
        return { kind, library: data.library, folder: data.folder };
      }
    } catch {
      // Invalid marker: treated as unmarked.
    }
    return null;
  }
  return null;
}
