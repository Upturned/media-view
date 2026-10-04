import {
  FIELD_LIMITS, fieldNumber, isFieldDate, isFieldLink, type FieldDef, type FieldKind, type FieldValue, type TagRef, type ThumbRef,
} from '@media-view/shared';

/** Custom field kinds as the wiki and the Tag types page show them (design M5 · 02, 04). */
export const KINDS: { kind: FieldKind; label: string; glyph: string }[] = [
  { kind: 'text', label: 'Text', glyph: 'Aa' },
  { kind: 'longtext', label: 'Long text', glyph: '¶' },
  { kind: 'number', label: 'Number', glyph: '12' },
  { kind: 'date', label: 'Date', glyph: '▦' },
  { kind: 'link', label: 'Link', glyph: '↗' },
  { kind: 'choice', label: 'Choice', glyph: '◉' },
  { kind: 'image', label: 'Image', glyph: '▣' },
  { kind: 'tagref', label: 'Tag reference', glyph: '⌗' },
];

export const kindInfo = (kind: FieldKind) => KINDS.find((k) => k.kind === kind)!;

/** A field's value while a page is edited. */
export interface FieldDraft {
  value: string;
  file: (ThumbRef & { filename: string }) | null;
  tags: TagRef[];
}

export function draftOf(v: FieldValue | undefined): FieldDraft {
  return { value: v?.value ?? '', file: v?.file ?? null, tags: v?.tags.slice() ?? [] };
}

export function isEmptyDraft(f: FieldDef, d: FieldDraft): boolean {
  if (f.kind === 'image') return !d.file;
  if (f.kind === 'tagref') return d.tags.length === 0;
  return d.value.trim() === '';
}

/** What's wrong with a value as typed, before saving; null when it's fine. */
export function draftProblem(f: FieldDef, d: FieldDraft): string | null {
  const v = d.value.trim();
  if (!v) return null;
  switch (f.kind) {
    case 'text':
      return v.length > FIELD_LIMITS.text ? `Up to ${FIELD_LIMITS.text} characters (${v.length} now).` : null;
    case 'longtext':
      return v.length > FIELD_LIMITS.longtext ? `Up to ${FIELD_LIMITS.longtext.toLocaleString('en-US')} characters (${v.length.toLocaleString('en-US')} now).` : null;
    case 'number':
      return fieldNumber(v) === null ? 'Not a number.' : null;
    case 'date':
      return isFieldDate(v) ? null : 'Use YYYY, YYYY-MM or YYYY-MM-DD.';
    case 'link':
      return isFieldLink(v) ? null : 'Must start with http://, https:// or file://';
    default:
      return null;
  }
}

/** The input sent on save. */
export function draftInput(f: FieldDef, d: FieldDraft) {
  if (f.kind === 'image') return { fileId: d.file?.id ?? null };
  if (f.kind === 'tagref') return { tagIds: d.tags.map((t) => t.id) };
  return { value: d.value.trim() };
}

export function sameDraft(a: FieldDraft, b: FieldDraft): boolean {
  return a.value.trim() === b.value.trim()
    && (a.file?.id ?? null) === (b.file?.id ?? null)
    && a.tags.map((t) => t.id).join() === b.tags.map((t) => t.id).join();
}

export const linkLabel = (v: string) => v.replace(/^[a-z]+:\/\//i, '').replace(/\/$/, '');
export const linkDomain = (v: string) => v.replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? '';

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
