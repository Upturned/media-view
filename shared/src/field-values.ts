/** Checks for custom field values, shared by the server and the wiki editor (technical doc §6.5). */

export const FIELD_LIMITS = { text: 500, longtext: 5000 } as const;

/** A year, a year and month, or a full date: `1954`, `1954-07`, `1954-07-29`. */
export function isFieldDate(v: string): boolean {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
  if (!m) return false;
  const month = m[2] ? Number(m[2]) : 1;
  if (month < 1 || month > 12) return false;
  if (!m[3]) return true;
  const day = Number(m[3]);
  const last = new Date(Date.UTC(Number(m[1]), month, 0)).getUTCDate();
  return day >= 1 && day <= last;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `1954-07-29` → `29 Jul 1954`; partial dates stay partial. */
export function prettyFieldDate(v: string): string {
  if (!isFieldDate(v)) return v;
  const [y, m, d] = v.split('-');
  if (d) return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (m) return `${MONTHS[Number(m) - 1]} ${y}`;
  return y!;
}

export const isFieldLink = (v: string) => /^(https?|file):\/\/\S+$/i.test(v);

/** A number as typed (`212,5` too), or null. */
export function fieldNumber(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
