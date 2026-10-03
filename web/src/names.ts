/** Client-side mirror of the server's name rules (server/src/lib/names.ts), for live feedback. */

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Why a name isn't valid, or '' if it is. */
export function nameProblem(raw: string): string {
  const name = raw.trim();
  if (!name) return 'A name is required.';
  if (name.length > 200) return 'The name is too long.';
  if (INVALID_CHARS.test(name)) return 'Not allowed in names:  \\ / : * ? " < > |';
  if (name.startsWith('.')) return "Names can't start with a dot.";
  if (name.endsWith('.')) return "Names can't end with a dot.";
  if (RESERVED.test(name)) return `“${name}” is reserved by Windows.`;
  return '';
}

export function splitExt(filename: string): { base: string; ext: string } {
  const i = filename.lastIndexOf('.');
  return i > 0 ? { base: filename.slice(0, i), ext: filename.slice(i) } : { base: filename, ext: '' };
}

/** Bulk rename: `#` = number (padded), `*` = original name; the extension is kept. */
export function patternName(filename: string, pattern: string, n: number, digits: number): { base: string; ext: string } {
  const { base, ext } = splitExt(filename);
  const num = String(n).padStart(digits, '0');
  return { base: pattern.split('#').join(num).split('*').join(base).trim(), ext };
}
