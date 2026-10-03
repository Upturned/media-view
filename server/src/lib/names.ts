import fs from 'node:fs';
import path from 'node:path';
import { badRequest } from './errors.ts';

/** Names of files and folders: Windows rules, plus no leading dot (hidden). */

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** A valid name, or a 400 explaining why not. `raw` is a folder name or a file name without extension. */
export function validateName(raw: string): string {
  const name = raw.normalize('NFC').trim();
  if (!name) throw badRequest('INVALID_NAME', 'A name is required.');
  if (name.length > 200) throw badRequest('INVALID_NAME', 'The name is too long.');
  if (INVALID_CHARS.test(name)) throw badRequest('INVALID_NAME', 'Not allowed in names:  \\ / : * ? " < > |');
  if (name.startsWith('.')) throw badRequest('INVALID_NAME', "Names can't start with a dot.");
  if (name.endsWith('.')) throw badRequest('INVALID_NAME', "Names can't end with a dot.");
  if (RESERVED.test(name)) throw badRequest('INVALID_NAME', `“${name}” is reserved by Windows.`);
  return name;
}

/** Make an incoming file name safe (uploads): invalid characters become '_'. */
export function sanitizeName(raw: string): string {
  const cleaned = raw.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
  return cleaned || 'image';
}

/** Split `name.ext` into base and extension (with the dot, lowercase kept as given). */
export function splitExt(filename: string): { base: string; ext: string } {
  const i = filename.lastIndexOf('.');
  return i > 0 ? { base: filename.slice(0, i), ext: filename.slice(i) } : { base: filename, ext: '' };
}

/**
 * `base.ext` if free in `dir`, else `base (1).ext`, `base (2).ext`… `taken` holds lowercase names
 * already claimed by the same operation.
 */
export function uniqueName(dir: string, base: string, ext: string, taken: Set<string> = new Set()): string {
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? `${base}${ext}` : `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase()) && !fs.existsSync(path.join(dir, candidate))) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}
