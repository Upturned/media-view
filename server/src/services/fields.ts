import type { FieldDef, FieldInput, FieldKind, FieldOptions, FieldValue } from '@media-view/shared';
import { FIELD_LIMITS, fieldNumber, isFieldDate, isFieldLink, typeKeyOf } from '@media-view/shared';
import type { DB } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { thumbRef } from './folders.ts';
import type { OpenLibrary } from './library.ts';

/** Custom fields per tag type and their values on tags (technical doc §6.5). */

export const FIELD_KINDS: FieldKind[] = ['text', 'longtext', 'number', 'date', 'link', 'choice', 'image', 'tagref'];
const SCALAR = new Set<FieldKind>(['text', 'longtext', 'number', 'date', 'link', 'choice']);

interface FieldRow {
  id: number;
  type_id: number;
  key: string;
  label: string;
  kind: FieldKind;
  options: string | null;
  position: number;
}

/** Options as stored; tag-reference types written by older seeds as keys become ids. */
function parseOptions(db: DB, raw: string | null): FieldOptions {
  const o = raw ? (JSON.parse(raw) as FieldOptions & { types?: (number | string)[] }) : {};
  if (o.types) {
    o.types = o.types
      .map((t) => (typeof t === 'number' ? t : (db.prepare('SELECT id FROM tag_types WHERE key = ?').pluck().get(t) as number | undefined)))
      .filter((t): t is number => typeof t === 'number');
  }
  return o as FieldOptions;
}

function filledCount(db: DB, fieldId: number, kind: FieldKind): number {
  return (kind === 'tagref'
    ? db.prepare('SELECT COUNT(DISTINCT tag_id) FROM tag_field_refs WHERE field_id = ?')
    : db.prepare('SELECT COUNT(*) FROM tag_field_values WHERE field_id = ? AND (value IS NOT NULL OR file_id IS NOT NULL)')
  ).pluck().get(fieldId) as number;
}

function toDef(db: DB, r: FieldRow): FieldDef {
  return {
    id: r.id, typeId: r.type_id, key: r.key, label: r.label, kind: r.kind, position: r.position,
    options: parseOptions(db, r.options), filled: filledCount(db, r.id, r.kind),
  };
}

export function listFields(lib: OpenLibrary, typeId?: number): FieldDef[] {
  const rows = lib.db.prepare(
    `SELECT * FROM tag_type_fields ${typeId ? 'WHERE type_id = ?' : ''} ORDER BY type_id, position, id`,
  ).all(...(typeId ? [typeId] : [])) as FieldRow[];
  return rows.map((r) => toDef(lib.db, r));
}

function fieldRow(lib: OpenLibrary, id: number): FieldRow {
  const f = lib.db.prepare('SELECT * FROM tag_type_fields WHERE id = ?').get(id) as FieldRow | undefined;
  if (!f) throw notFound('FIELD_NOT_FOUND', 'This field no longer exists.');
  return f;
}

function validLabel(raw: string): string {
  const label = raw.replace(/\s+/g, ' ').trim();
  if (!label) throw badRequest('INVALID_NAME', 'A name is required.');
  if (label.length > 60) throw badRequest('INVALID_NAME', 'The name is too long.');
  return label;
}

function cleanOptions(kind: FieldKind, o: FieldOptions): FieldOptions {
  if (kind === 'choice') {
    const seen = new Set<string>();
    const choices = (o.choices ?? []).map((c) => c.trim()).filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));
    return { choices };
  }
  if (kind === 'number') return o.unit?.trim() ? { unit: o.unit.trim().slice(0, 20) } : {};
  if (kind === 'tagref') return { types: o.types ?? [], multi: o.multi ?? false };
  return {};
}

export function addField(lib: OpenLibrary, typeId: number, input: { label: string; kind: FieldKind; options?: FieldOptions }): FieldDef {
  const { db } = lib;
  if (!db.prepare('SELECT 1 FROM tag_types WHERE id = ?').get(typeId)) throw notFound('TYPE_NOT_FOUND', 'This tag type no longer exists.');
  const label = validLabel(input.label);
  const base = typeKeyOf(label);
  let key = base;
  for (let n = 2; db.prepare('SELECT 1 FROM tag_type_fields WHERE type_id = ? AND key = ?').get(typeId, key); n++) key = `${base}_${n}`;
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM tag_type_fields WHERE type_id = ?').pluck().get(typeId) as number;
  const id = db.prepare('INSERT INTO tag_type_fields (type_id, key, label, kind, options, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(typeId, key, label, input.kind, JSON.stringify(cleanOptions(input.kind, input.options ?? {})), position).lastInsertRowid as number;
  emit({ type: 'files-changed' });
  return toDef(db, fieldRow(lib, id));
}

/** Rename a field or change its settings (its key stays: values follow it across type changes). */
export function updateField(lib: OpenLibrary, id: number, change: { label?: string; options?: FieldOptions }): FieldDef {
  const { db } = lib;
  const f = fieldRow(lib, id);
  if (change.label !== undefined) db.prepare('UPDATE tag_type_fields SET label = ? WHERE id = ?').run(validLabel(change.label), id);
  if (change.options !== undefined) {
    const options = cleanOptions(f.kind, { ...parseOptions(db, f.options), ...change.options });
    // Values no longer allowed by the new settings are cleared (choices removed, references of other types).
    db.transaction(() => {
      db.prepare('UPDATE tag_type_fields SET options = ? WHERE id = ?').run(JSON.stringify(options), id);
      if (f.kind === 'choice') {
        const allowed = new Set((options.choices ?? []).map((c) => c.toLowerCase()));
        for (const v of db.prepare('SELECT tag_id, value FROM tag_field_values WHERE field_id = ?').all(id) as { tag_id: number; value: string }[]) {
          if (v.value && !allowed.has(v.value.toLowerCase())) db.prepare('DELETE FROM tag_field_values WHERE tag_id = ? AND field_id = ?').run(v.tag_id, id);
        }
      }
      if (f.kind === 'tagref' && options.types?.length) {
        db.prepare(`DELETE FROM tag_field_refs WHERE field_id = ? AND ref_tag_id IN (SELECT id FROM tags WHERE type_id NOT IN (${options.types.map(() => '?').join(',')}))`)
          .run(id, ...options.types);
      }
    })();
  }
  emit({ type: 'files-changed' });
  return toDef(db, fieldRow(lib, id));
}

export function moveField(lib: OpenLibrary, id: number, delta: -1 | 1): FieldDef[] {
  const { db } = lib;
  const f = fieldRow(lib, id);
  const order = (db.prepare('SELECT id FROM tag_type_fields WHERE type_id = ? ORDER BY position, id').pluck().all(f.type_id) as number[]);
  const i = order.indexOf(id);
  const j = i + delta;
  if (j >= 0 && j < order.length) {
    [order[i], order[j]] = [order[j]!, order[i]!];
    const set = db.prepare('UPDATE tag_type_fields SET position = ? WHERE id = ?');
    db.transaction(() => order.forEach((fid, pos) => set.run(pos, fid)))();
    emit({ type: 'files-changed' });
  }
  return listFields(lib, f.type_id);
}

export function deleteField(lib: OpenLibrary, id: number): void {
  fieldRow(lib, id);
  lib.db.prepare('DELETE FROM tag_type_fields WHERE id = ?').run(id); // values cascade
  emit({ type: 'files-changed' });
}

// ─── Values ──────────────────────────────────────────────────────────────────

/** A text-like value checked against its kind; returns the stored form or throws. */
export function checkScalar(kind: FieldKind, raw: string, options: FieldOptions): string {
  const v = raw.trim();
  switch (kind) {
    case 'text':
      if (v.length > FIELD_LIMITS.text) throw badRequest('INVALID_VALUE', 'Text fields hold up to 500 characters.');
      return v;
    case 'longtext':
      if (v.length > FIELD_LIMITS.longtext) throw badRequest('INVALID_VALUE', 'Long text fields hold up to 5,000 characters.');
      return v;
    case 'number': {
      const n = fieldNumber(v);
      if (n === null) throw badRequest('INVALID_VALUE', `“${v}” isn’t a number.`);
      return String(n);
    }
    case 'date':
      if (!isFieldDate(v)) throw badRequest('INVALID_VALUE', `“${v}” isn’t a date (YYYY, YYYY-MM or YYYY-MM-DD).`);
      return v;
    case 'link':
      if (!isFieldLink(v)) throw badRequest('INVALID_VALUE', 'Links start with http://, https:// or file://');
      return v;
    case 'choice': {
      const match = (options.choices ?? []).find((c) => c.toLowerCase() === v.toLowerCase());
      if (!match) throw badRequest('INVALID_VALUE', `“${v}” isn’t one of the choices.`);
      return match;
    }
    default:
      throw badRequest('INVALID_VALUE', 'This field doesn’t hold text.');
  }
}

export function valuesOf(lib: OpenLibrary, tagId: number): FieldValue[] {
  const { db } = lib;
  const scalar = db.prepare(
    `SELECT v.field_id, v.value, f.id AS file_id, f.filename, f.hash, f.mtime FROM tag_field_values v
     LEFT JOIN files f ON f.id = v.file_id AND f.recycled = 0
     WHERE v.tag_id = ?`,
  ).all(tagId) as { field_id: number; value: string | null; file_id: number | null; filename: string; hash: string | null; mtime: number }[];
  const refs = db.prepare(
    `SELECT r.field_id, t.id, t.type_id, t.name FROM tag_field_refs r JOIN tags t ON t.id = r.ref_tag_id
     WHERE r.tag_id = ? ORDER BY r.field_id, r.position`,
  ).all(tagId) as { field_id: number; id: number; type_id: number; name: string }[];

  const out = new Map<number, FieldValue>();
  const get = (fieldId: number) => out.get(fieldId) ?? out.set(fieldId, { fieldId, value: null, file: null, tags: [] }).get(fieldId)!;
  for (const s of scalar) {
    const v = get(s.field_id);
    v.value = s.value;
    if (s.file_id) v.file = { ...thumbRef({ id: s.file_id, hash: s.hash, mtime: s.mtime }), filename: s.filename };
  }
  for (const r of refs) get(r.field_id).tags.push({ id: r.id, typeId: r.type_id, name: r.name });
  return [...out.values()].filter((v) => v.value !== null || v.file !== null || v.tags.length > 0);
}

/** Set (or clear) field values on a tag. Inputs are validated against each field's kind. */
export function setValues(lib: OpenLibrary, tagId: number, typeId: number, inputs: Record<string, FieldInput>): void {
  const { db } = lib;
  const fields = new Map(listFields(lib, typeId).map((f) => [f.id, f]));
  const del = db.prepare('DELETE FROM tag_field_values WHERE tag_id = ? AND field_id = ?');
  const put = db.prepare('INSERT INTO tag_field_values (tag_id, field_id, value, file_id) VALUES (?, ?, ?, ?) ON CONFLICT (tag_id, field_id) DO UPDATE SET value = excluded.value, file_id = excluded.file_id');
  const delRefs = db.prepare('DELETE FROM tag_field_refs WHERE tag_id = ? AND field_id = ?');
  const putRef = db.prepare('INSERT INTO tag_field_refs (tag_id, field_id, ref_tag_id, position) VALUES (?, ?, ?, ?)');

  for (const [key, input] of Object.entries(inputs)) {
    const f = fields.get(Number(key));
    if (!f) throw badRequest('FIELD_NOT_FOUND', 'A field doesn’t belong to this tag’s type.');
    if (SCALAR.has(f.kind)) {
      const raw = input.value ?? '';
      if (!raw.trim()) del.run(tagId, f.id);
      else put.run(tagId, f.id, checkScalar(f.kind, raw, f.options), null);
    } else if (f.kind === 'image') {
      if (input.fileId == null) del.run(tagId, f.id);
      else {
        if (!db.prepare('SELECT 1 FROM files WHERE id = ? AND recycled = 0').get(input.fileId)) throw notFound('FILE_NOT_FOUND', 'That image no longer exists.');
        put.run(tagId, f.id, null, input.fileId);
      }
    } else {
      const ids = [...new Set(input.tagIds ?? [])];
      if (!f.options.multi && ids.length > 1) throw badRequest('INVALID_VALUE', `${f.label} holds one tag.`);
      for (const id of ids) {
        const t = db.prepare('SELECT type_id FROM tags WHERE id = ?').get(id) as { type_id: number } | undefined;
        if (!t) throw notFound('TAG_NOT_FOUND', 'A referenced tag no longer exists.');
        if (id === tagId) throw badRequest('INVALID_VALUE', 'A tag can’t refer to itself.');
        if (f.options.types?.length && !f.options.types.includes(t.type_id)) throw badRequest('INVALID_VALUE', `${f.label} only takes some types of tags.`);
      }
      delRefs.run(tagId, f.id);
      ids.forEach((id, i) => putRef.run(tagId, f.id, id, i));
    }
  }
}

// ─── Kind changes ────────────────────────────────────────────────────────────

/** Whether one stored value survives a kind change, and as what. */
function convertValue(v: { value: string | null; file_id: number | null }, to: FieldKind, options: FieldOptions): string | null {
  if (v.value === null) return null; // images and references never convert
  if (to === 'choice') return v.value; // the choices grow to include existing values
  try {
    return checkScalar(to, v.value, options);
  } catch {
    return null;
  }
}

/** For each kind, how many existing values would be lost by switching to it (design M5 · 04). */
export function kindCosts(lib: OpenLibrary, id: number): Record<FieldKind, number> {
  const { db } = lib;
  const f = fieldRow(lib, id);
  const options = parseOptions(db, f.options);
  const filled = filledCount(db, id, f.kind);
  const values = db.prepare('SELECT value, file_id FROM tag_field_values WHERE field_id = ?').all(id) as { value: string | null; file_id: number | null }[];
  const costs = {} as Record<FieldKind, number>;
  for (const to of FIELD_KINDS) {
    if (to === f.kind) costs[to] = 0;
    else if (!SCALAR.has(f.kind) || !SCALAR.has(to)) costs[to] = filled;
    else costs[to] = values.filter((v) => convertValue(v, to, options) === null).length;
  }
  return costs;
}

/** Change a field's kind. Refused if values would be lost, unless `clearLost` (they're cleared). */
export function changeKind(lib: OpenLibrary, id: number, to: FieldKind, clearLost = false): FieldDef {
  const { db } = lib;
  const f = fieldRow(lib, id);
  if (to === f.kind) return toDef(db, f);
  const lost = kindCosts(lib, id)[to];
  if (lost > 0 && !clearLost) throw conflict('VALUES_WOULD_BE_LOST', `${lost} ${lost === 1 ? 'value' : 'values'} can’t convert to ${to}.`);
  const old = parseOptions(db, f.options);
  db.transaction(() => {
    const values = db.prepare('SELECT tag_id, value, file_id FROM tag_field_values WHERE field_id = ?').all(id) as { tag_id: number; value: string | null; file_id: number | null }[];
    const options = cleanOptions(to, to === 'choice'
      ? { choices: [...(old.choices ?? []), ...values.map((v) => v.value ?? '').filter(Boolean)] }
      : to === 'number' ? { unit: old.unit } : {});
    db.prepare('UPDATE tag_type_fields SET kind = ?, options = ? WHERE id = ?').run(to, JSON.stringify(options), id);
    if (!SCALAR.has(f.kind) || !SCALAR.has(to)) {
      db.prepare('DELETE FROM tag_field_values WHERE field_id = ?').run(id);
      db.prepare('DELETE FROM tag_field_refs WHERE field_id = ?').run(id);
      return;
    }
    for (const v of values) {
      const nv = convertValue(v, to, options);
      if (nv === null) db.prepare('DELETE FROM tag_field_values WHERE tag_id = ? AND field_id = ?').run(v.tag_id, id);
      else db.prepare('UPDATE tag_field_values SET value = ? WHERE tag_id = ? AND field_id = ?').run(nv, v.tag_id, id);
    }
  })();
  emit({ type: 'files-changed' });
  return toDef(db, fieldRow(lib, id));
}

// ─── Type changes (technical doc §6.5) ───────────────────────────────────────

/** Values a tag would lose by moving to another type: fields whose key doesn't exist there (or differs in kind). */
export function typeChangeLoss(lib: OpenLibrary, tagId: number, fromType: number, toType: number): { fieldId: number; label: string; value: string }[] {
  if (fromType === toType) return [];
  const target = new Map(listFields(lib, toType).map((f) => [f.key, f]));
  const fields = new Map(listFields(lib, fromType).map((f) => [f.id, f]));
  return valuesOf(lib, tagId)
    .filter((v) => {
      const f = fields.get(v.fieldId)!;
      const t = target.get(f.key);
      return !t || t.kind !== f.kind;
    })
    .map((v) => ({
      fieldId: v.fieldId,
      label: fields.get(v.fieldId)!.label,
      value: v.value ?? v.file?.filename ?? v.tags.map((t) => t.name).join(', '),
    }));
}

/** Move a tag's values to the matching fields (same key and kind) of its new type; the rest go. */
export function moveValuesToType(db: DB, tagId: number, fromType: number, toType: number): void {
  const from = db.prepare('SELECT id, key, kind FROM tag_type_fields WHERE type_id = ?').all(fromType) as { id: number; key: string; kind: string }[];
  const to = new Map((db.prepare('SELECT id, key, kind FROM tag_type_fields WHERE type_id = ?').all(toType) as { id: number; key: string; kind: string }[]).map((f) => [f.key, f]));
  for (const f of from) {
    const t = to.get(f.key);
    if (t && t.kind === f.kind) {
      db.prepare('UPDATE tag_field_values SET field_id = ? WHERE tag_id = ? AND field_id = ?').run(t.id, tagId, f.id);
      db.prepare('UPDATE tag_field_refs SET field_id = ? WHERE tag_id = ? AND field_id = ?').run(t.id, tagId, f.id);
    } else {
      db.prepare('DELETE FROM tag_field_values WHERE tag_id = ? AND field_id = ?').run(tagId, f.id);
      db.prepare('DELETE FROM tag_field_refs WHERE tag_id = ? AND field_id = ?').run(tagId, f.id);
    }
  }
}
