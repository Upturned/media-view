import {
  displayTagName, normTagName, tagNameProblem, typeKeyOf,
  type FileTag, type TagCoverage, type TagDetail, type TagRef, type TagSuggestion, type TagSummary, type TagTypeInfo,
} from '@media-view/shared';
import type { DB } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { thumbRef } from './folders.ts';
import type { OpenLibrary } from './library.ts';

/** Tags, tag types, aliases, implications and merging (technical doc §10). */

interface TagRow {
  id: number;
  type_id: number;
  name: string;
  name_norm: string;
  description: string | null;
  cover_file_id: number | null;
  created_at: number;
}

const LIVE_FILE = 'f.recycled = 0 AND f.missing_since IS NULL';

function changed(): void {
  emit({ type: 'files-changed' });
}

// ─── Tag types ───────────────────────────────────────────────────────────────

export function listTypes(lib: OpenLibrary): TagTypeInfo[] {
  return (lib.db.prepare(
    `SELECT t.id, t.key, t.name, t.color, t.position, t.is_default,
            (SELECT COUNT(*) FROM tags WHERE type_id = t.id) AS tag_count
     FROM tag_types t ORDER BY t.position, t.id`,
  ).all() as { id: number; key: string; name: string; color: string; position: number; is_default: number; tag_count: number }[])
    .map((t) => ({ id: t.id, key: t.key, name: t.name, color: t.color, position: t.position, isDefault: t.is_default === 1, tagCount: t.tag_count }));
}

function typeRow(lib: OpenLibrary, id: number) {
  const t = lib.db.prepare('SELECT id, key, name, is_default FROM tag_types WHERE id = ?').get(id) as { id: number; key: string; name: string; is_default: number } | undefined;
  if (!t) throw notFound('TYPE_NOT_FOUND', 'This tag type no longer exists.');
  return t;
}

function defaultTypeId(db: DB): number {
  return db.prepare('SELECT id FROM tag_types WHERE is_default = 1').pluck().get() as number;
}

/** A unique key for a type name (`body_parts`, `body_parts_2`, …). */
function uniqueTypeKey(db: DB, name: string, self?: number): string {
  const base = typeKeyOf(name);
  for (let n = 1; ; n++) {
    const key = n === 1 ? base : `${base}_${n}`;
    const taken = db.prepare('SELECT id FROM tag_types WHERE key = ?').pluck().get(key) as number | undefined;
    if (taken === undefined || taken === self) return key;
  }
}

const COLOR = /^#[0-9a-f]{6}$/i;

function validTypeName(raw: string): string {
  const name = displayTagName(raw);
  if (!name) throw badRequest('INVALID_NAME', 'A name is required.');
  if (name.length > 40) throw badRequest('INVALID_NAME', 'The name is too long.');
  return name;
}

export function createType(lib: OpenLibrary, input: { name: string; color: string }): TagTypeInfo {
  const { db } = lib;
  const name = validTypeName(input.name);
  if (!COLOR.test(input.color)) throw badRequest('INVALID_COLOR', 'Colors are #RRGGBB.');
  const position = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM tag_types').pluck().get() as number);
  const id = db.prepare('INSERT INTO tag_types (key, name, color, position, is_default) VALUES (?, ?, ?, ?, 0)')
    .run(uniqueTypeKey(db, name), name, input.color, position).lastInsertRowid as number;
  changed();
  return listTypes(lib).find((t) => t.id === id)!;
}

export function updateType(lib: OpenLibrary, id: number, change: { name?: string; color?: string; isDefault?: boolean }): TagTypeInfo {
  const { db } = lib;
  typeRow(lib, id);
  db.transaction(() => {
    if (change.name !== undefined) {
      const name = validTypeName(change.name);
      db.prepare('UPDATE tag_types SET name = ?, key = ? WHERE id = ?').run(name, uniqueTypeKey(db, name, id), id);
    }
    if (change.color !== undefined) {
      if (!COLOR.test(change.color)) throw badRequest('INVALID_COLOR', 'Colors are #RRGGBB.');
      db.prepare('UPDATE tag_types SET color = ? WHERE id = ?').run(change.color, id);
    }
    if (change.isDefault) {
      db.prepare('UPDATE tag_types SET is_default = (id = ?)').run(id);
    }
  })();
  changed();
  return listTypes(lib).find((t) => t.id === id)!;
}

/** Move a type up (-1) or down (+1) in the order. */
export function moveType(lib: OpenLibrary, id: number, delta: -1 | 1): TagTypeInfo[] {
  const { db } = lib;
  const order = listTypes(lib).map((t) => t.id);
  const i = order.indexOf(id);
  if (i < 0) throw notFound('TYPE_NOT_FOUND', 'This tag type no longer exists.');
  const j = i + delta;
  if (j >= 0 && j < order.length) {
    [order[i], order[j]] = [order[j]!, order[i]!];
    const set = db.prepare('UPDATE tag_types SET position = ? WHERE id = ?');
    db.transaction(() => order.forEach((tid, pos) => set.run(pos, tid)))();
    changed();
  }
  return listTypes(lib);
}

export function deleteType(lib: OpenLibrary, id: number): void {
  const { db } = lib;
  const t = typeRow(lib, id);
  if (t.is_default) throw conflict('TYPE_IS_DEFAULT', 'Pick another default type first.');
  const n = db.prepare('SELECT COUNT(*) FROM tags WHERE type_id = ?').pluck().get(id) as number;
  if (n > 0) throw conflict('TYPE_IN_USE', `${t.name} still has ${n} ${n === 1 ? 'tag' : 'tags'}. Move or delete them first.`);
  db.prepare('DELETE FROM tag_types WHERE id = ?').run(id);
  changed();
}

// ─── Reading tags ────────────────────────────────────────────────────────────

function tagRow(lib: OpenLibrary, id: number): TagRow {
  const t = lib.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;
  if (!t) throw notFound('TAG_NOT_FOUND', 'This tag no longer exists.');
  return t;
}

const ref = (t: { id: number; type_id: number; name: string }): TagRef => ({ id: t.id, typeId: t.type_id, name: t.name });

/** Images carrying each tag (live images only). */
function counts(db: DB, tagIds?: number[]): Map<number, number> {
  const rows = db.prepare(
    `SELECT ft.tag_id, COUNT(*) AS n FROM file_tags ft JOIN files f ON f.id = ft.file_id
     WHERE ${LIVE_FILE} ${tagIds ? `AND ft.tag_id IN (${tagIds.map(() => '?').join(',') || 'NULL'})` : ''}
     GROUP BY ft.tag_id`,
  ).all(...(tagIds ?? [])) as { tag_id: number; n: number }[];
  return new Map(rows.map((r) => [r.tag_id, r.n]));
}

function aliasesOf(db: DB, tagIds: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (tagIds.length === 0) return out;
  const rows = db.prepare(`SELECT tag_id, alias FROM tag_aliases WHERE tag_id IN (${tagIds.map(() => '?').join(',')}) ORDER BY alias`)
    .all(...tagIds) as { tag_id: number; alias: string }[];
  for (const r of rows) out.set(r.tag_id, [...(out.get(r.tag_id) ?? []), r.alias]);
  return out;
}

/** The tags directory: every tag (or those whose name or alias contains `q`), with counts and aliases. */
export function listTags(lib: OpenLibrary, opts: { q?: string; typeId?: number; sort?: 'name' | 'count'; limit?: number } = {}): TagSummary[] {
  const { db } = lib;
  const parts: string[] = [];
  const params: unknown[] = [];
  const q = opts.q ? normTagName(opts.q) : '';
  if (q) {
    parts.push(`(t.name_norm LIKE ? ESCAPE '\\' OR t.id IN (SELECT tag_id FROM tag_aliases WHERE alias_norm LIKE ? ESCAPE '\\'))`);
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    params.push(like, like);
  }
  if (opts.typeId) {
    parts.push('t.type_id = ?');
    params.push(opts.typeId);
  }
  const rows = db.prepare(`SELECT t.id, t.type_id, t.name FROM tags t ${parts.length ? `WHERE ${parts.join(' AND ')}` : ''}`)
    .all(...params) as { id: number; type_id: number; name: string }[];
  const n = counts(db);
  const aka = aliasesOf(db, rows.map((r) => r.id));
  const out = rows.map((r) => ({ ...ref(r), count: n.get(r.id) ?? 0, aliases: aka.get(r.id) ?? [] }));
  out.sort(opts.sort === 'count'
    ? (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    : (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export function tagDetail(lib: OpenLibrary, id: number): TagDetail {
  const { db } = lib;
  const t = tagRow(lib, id);
  const cover = t.cover_file_id
    ? db.prepare(`SELECT id, hash, mtime FROM files f WHERE id = ? AND ${LIVE_FILE}`).get(t.cover_file_id) as { id: number; hash: string | null; mtime: number } | undefined
    : undefined;
  const implies = db.prepare('SELECT t.id, t.type_id, t.name FROM tag_implications i JOIN tags t ON t.id = i.implied_tag_id WHERE i.tag_id = ? ORDER BY t.name')
    .all(id) as { id: number; type_id: number; name: string }[];
  const impliedBy = db.prepare('SELECT t.id, t.type_id, t.name FROM tag_implications i JOIN tags t ON t.id = i.tag_id WHERE i.implied_tag_id = ? ORDER BY t.name')
    .all(id) as { id: number; type_id: number; name: string }[];
  return {
    ...ref(t),
    count: counts(db, [id]).get(id) ?? 0,
    aliases: aliasesOf(db, [id]).get(id) ?? [],
    description: t.description,
    cover: cover ? thumbRef(cover) : null,
    createdAt: t.created_at,
    implies: implies.map(ref),
    impliedBy: impliedBy.map(ref),
  };
}

/** Split `character:frodo` into a type key and a name (only for known type keys). */
function splitTyped(db: DB, input: string): { typeId: number | null; name: string } {
  const m = /^#?([\p{L}\p{N}_-]+):(.*)$/u.exec(input.trim());
  if (m) {
    const typeId = db.prepare('SELECT id FROM tag_types WHERE key = ?').pluck().get(m[1]!.toLowerCase()) as number | undefined;
    if (typeId !== undefined) return { typeId, name: displayTagName(m[2]!) };
  }
  return { typeId: null, name: displayTagName(input.replace(/^#/, '')) };
}

/**
 * Autocomplete (technical doc §10.3): tags whose name or alias starts with — then contains — the
 * input, best-used first. `type:` narrows to a type.
 */
export function suggestTags(lib: OpenLibrary, input: string, limit = 8): TagSuggestion[] {
  const { db } = lib;
  const { typeId, name } = splitTyped(db, input);
  const q = normTagName(name);
  const like = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);
  const typeCond = typeId ? 'AND t.type_id = ?' : '';
  const typeParam = typeId ? [typeId] : [];
  const byName = db.prepare(
    `SELECT t.id, t.type_id, t.name, NULL AS alias, (t.name_norm LIKE ? ESCAPE '\\') AS prefix FROM tags t
     WHERE t.name_norm LIKE ? ESCAPE '\\' ${typeCond}`,
  ).all(`${like(q)}%`, `%${like(q)}%`, ...typeParam) as { id: number; type_id: number; name: string; alias: string | null; prefix: number }[];
  const byAlias = db.prepare(
    `SELECT t.id, t.type_id, t.name, a.alias, (a.alias_norm LIKE ? ESCAPE '\\') AS prefix FROM tag_aliases a JOIN tags t ON t.id = a.tag_id
     WHERE a.alias_norm LIKE ? ESCAPE '\\' ${typeCond}`,
  ).all(`${like(q)}%`, `%${like(q)}%`, ...typeParam) as typeof byName;

  const n = counts(db);
  const seen = new Set<number>();
  return [...byName, ...byAlias]
    .map((r) => ({ ...r, count: n.get(r.id) ?? 0 }))
    .sort((a, b) => b.prefix - a.prefix || b.count - a.count || a.name.localeCompare(b.name))
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .slice(0, limit)
    .map((r) => ({ id: r.id, typeId: r.type_id, name: r.name, count: r.count, alias: r.alias }));
}

/** Tag ids a search term refers to (names, then aliases), across types when untyped. */
export function resolveTerm(db: DB, typeKey: string | null, name: string): number[] {
  const n = normTagName(name);
  if (!n) return [];
  const typeId = typeKey ? db.prepare('SELECT id FROM tag_types WHERE key = ?').pluck().get(typeKey) as number | undefined : undefined;
  if (typeKey && typeId === undefined) return [];
  const byName = db.prepare(`SELECT id FROM tags WHERE name_norm = ? ${typeId ? 'AND type_id = ?' : ''}`).pluck()
    .all(n, ...(typeId ? [typeId] : [])) as number[];
  if (byName.length) return byName;
  return db.prepare(`SELECT tag_id FROM tag_aliases WHERE alias_norm = ? ${typeId ? 'AND type_id = ?' : ''}`).pluck()
    .all(n, ...(typeId ? [typeId] : [])) as number[];
}

// ─── Creating and changing tags ──────────────────────────────────────────────

function validTagName(raw: string): string {
  const problem = tagNameProblem(raw);
  if (problem) throw badRequest('INVALID_NAME', problem);
  return displayTagName(raw);
}

/** Throws if `name` is already a tag or an alias of another tag in the type. */
function assertNameFree(db: DB, typeId: number, name: string, self?: number): void {
  const n = normTagName(name);
  const tag = db.prepare('SELECT id, name FROM tags WHERE type_id = ? AND name_norm = ?').get(typeId, n) as { id: number; name: string } | undefined;
  if (tag && tag.id !== self) throw conflict('NAME_TAKEN', `“${tag.name}” already exists in this type.`);
  const alias = db.prepare('SELECT a.alias, t.name, t.id FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE a.type_id = ? AND a.alias_norm = ?')
    .get(typeId, n) as { alias: string; name: string; id: number } | undefined;
  if (alias && alias.id !== self) throw conflict('NAME_TAKEN', `“${alias.alias}” is already an alias of ${alias.name}.`);
}

/** Create a tag (of the default type unless given, or typed as `type:name`). */
export function createTag(lib: OpenLibrary, input: { name: string; typeId?: number }): TagDetail {
  const { db } = lib;
  const split = splitTyped(db, input.name);
  const typeId = input.typeId ?? split.typeId ?? defaultTypeId(db);
  typeRow(lib, typeId);
  const name = validTagName(split.name);
  assertNameFree(db, typeId, name);
  const now = Date.now();
  const id = db.prepare('INSERT INTO tags (type_id, name, name_norm, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(typeId, name, normTagName(name), now, now).lastInsertRowid as number;
  changed();
  return tagDetail(lib, id);
}

/** Rename a tag and/or change its type. Its aliases move with it (ones that would clash are dropped). */
export function updateTag(lib: OpenLibrary, id: number, change: { name?: string; typeId?: number; coverFileId?: number | null }): TagDetail {
  const { db } = lib;
  const t = tagRow(lib, id);
  const typeId = change.typeId ?? t.type_id;
  const name = change.name !== undefined ? validTagName(change.name) : t.name;
  if (change.typeId !== undefined) typeRow(lib, typeId);

  db.transaction(() => {
    if (typeId !== t.type_id || normTagName(name) !== t.name_norm) {
      // Renaming to one of its own aliases swaps them.
      db.prepare('DELETE FROM tag_aliases WHERE tag_id = ? AND alias_norm = ?').run(id, normTagName(name));
      assertNameFree(db, typeId, name, id);
    }
    db.prepare('UPDATE tags SET name = ?, name_norm = ?, type_id = ?, updated_at = ? WHERE id = ?')
      .run(name, normTagName(name), typeId, Date.now(), id);
    if (typeId !== t.type_id) {
      for (const a of db.prepare('SELECT alias, alias_norm FROM tag_aliases WHERE tag_id = ?').all(id) as { alias: string; alias_norm: string }[]) {
        const clash = db.prepare('SELECT 1 FROM tags WHERE type_id = ? AND name_norm = ? UNION SELECT 1 FROM tag_aliases WHERE type_id = ? AND alias_norm = ? AND tag_id <> ?')
          .get(typeId, a.alias_norm, typeId, a.alias_norm, id);
        if (clash) db.prepare('DELETE FROM tag_aliases WHERE tag_id = ? AND alias_norm = ?').run(id, a.alias_norm);
        else db.prepare('UPDATE tag_aliases SET type_id = ? WHERE tag_id = ? AND alias_norm = ?').run(typeId, id, a.alias_norm);
      }
    }
    if (change.coverFileId !== undefined) {
      if (change.coverFileId !== null) {
        const has = db.prepare('SELECT 1 FROM file_tags WHERE file_id = ? AND tag_id = ?').get(change.coverFileId, id);
        if (!has) throw badRequest('NOT_TAGGED', 'The cover must be an image with this tag.');
      }
      db.prepare('UPDATE tags SET cover_file_id = ? WHERE id = ?').run(change.coverFileId, id);
    }
  })();
  changed();
  return tagDetail(lib, id);
}

/** Delete a tag: it's removed from every image; the images stay. */
export function deleteTags(lib: OpenLibrary, ids: number[]): { deleted: number } {
  const { db } = lib;
  const files = filesWithTags(db, ids);
  let deleted = 0;
  db.transaction(() => {
    for (const id of ids) deleted += db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes;
    recomputeImplied(db, files);
  })();
  if (deleted) {
    log('info', 'tags', 'tags deleted', { ids, deleted });
    changed();
  }
  return { deleted };
}

// ─── Aliases (technical doc §10.5) ───────────────────────────────────────────

export function addAlias(lib: OpenLibrary, id: number, raw: string): TagDetail {
  const { db } = lib;
  const t = tagRow(lib, id);
  const alias = validTagName(raw);
  const n = normTagName(alias);
  if (n === t.name_norm) throw badRequest('ALIAS_IS_NAME', 'That’s already its name.');
  const tag = db.prepare('SELECT name FROM tags WHERE type_id = ? AND name_norm = ?').pluck().get(t.type_id, n) as string | undefined;
  if (tag) throw conflict('ALIAS_IS_TAG', `“${tag}” is a tag of this type — merge it instead.`);
  const other = db.prepare('SELECT t.name FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE a.type_id = ? AND a.alias_norm = ?')
    .pluck().get(t.type_id, n) as string | undefined;
  if (other) throw conflict('ALIAS_TAKEN', `“${alias}” is already an alias of ${other}.`);
  db.prepare('INSERT INTO tag_aliases (type_id, alias_norm, alias, tag_id) VALUES (?, ?, ?, ?)').run(t.type_id, n, alias, id);
  changed();
  return tagDetail(lib, id);
}

export function removeAlias(lib: OpenLibrary, id: number, alias: string): TagDetail {
  lib.db.prepare('DELETE FROM tag_aliases WHERE tag_id = ? AND alias_norm = ?').run(id, normTagName(alias));
  changed();
  return tagDetail(lib, id);
}

/** The alias becomes the main name; the old name becomes an alias. Ids don't change. */
export function makeMainName(lib: OpenLibrary, id: number, alias: string): TagDetail {
  const { db } = lib;
  const t = tagRow(lib, id);
  const row = db.prepare('SELECT alias, alias_norm FROM tag_aliases WHERE tag_id = ? AND alias_norm = ?').get(id, normTagName(alias)) as { alias: string; alias_norm: string } | undefined;
  if (!row) throw notFound('ALIAS_NOT_FOUND', 'That alias no longer exists.');
  db.transaction(() => {
    db.prepare('DELETE FROM tag_aliases WHERE tag_id = ? AND alias_norm = ?').run(id, row.alias_norm);
    db.prepare('UPDATE tags SET name = ?, name_norm = ?, updated_at = ? WHERE id = ?').run(row.alias, row.alias_norm, Date.now(), id);
    db.prepare('INSERT INTO tag_aliases (type_id, alias_norm, alias, tag_id) VALUES (?, ?, ?, ?)').run(t.type_id, t.name_norm, t.name, id);
  })();
  changed();
  return tagDetail(lib, id);
}

// ─── Implications (technical doc §10.4) ──────────────────────────────────────

function implicationGraph(db: DB): Map<number, number[]> {
  const g = new Map<number, number[]>();
  for (const e of db.prepare('SELECT tag_id, implied_tag_id FROM tag_implications').all() as { tag_id: number; implied_tag_id: number }[]) {
    g.set(e.tag_id, [...(g.get(e.tag_id) ?? []), e.implied_tag_id]);
  }
  return g;
}

/** Everything a tag implies, transitively (not including itself). */
function closureOf(graph: Map<number, number[]>, tag: number, memo = new Map<number, Set<number>>()): Set<number> {
  const cached = memo.get(tag);
  if (cached) return cached;
  const out = new Set<number>();
  const stack = [...(graph.get(tag) ?? [])];
  while (stack.length) {
    const t = stack.pop()!;
    if (out.has(t) || t === tag) continue;
    out.add(t);
    stack.push(...(graph.get(t) ?? []));
  }
  memo.set(tag, out);
  return out;
}

/** Whether following a tag's implications ever leads back to it. */
function loopsBack(graph: Map<number, number[]>, tag: number): boolean {
  return (graph.get(tag) ?? []).some((t) => t === tag || closureOf(graph, t).has(tag));
}

function filesWithTags(db: DB, tagIds: number[]): number[] {
  if (tagIds.length === 0) return [];
  return db.prepare(`SELECT DISTINCT file_id FROM file_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')})`).pluck().all(...tagIds) as number[];
}

/**
 * Implied tags are materialized in file_tags (source = 'implied'): for each file, they're exactly the
 * closure of its manual tags. Re-derive them for `fileIds`.
 */
export function recomputeImplied(db: DB, fileIds: Iterable<number>): void {
  const graph = implicationGraph(db);
  const memo = new Map<number, Set<number>>();
  const manualOf = db.prepare("SELECT tag_id FROM file_tags WHERE file_id = ? AND source = 'manual'").pluck();
  const impliedOf = db.prepare("SELECT tag_id FROM file_tags WHERE file_id = ? AND source = 'implied'").pluck();
  const del = db.prepare("DELETE FROM file_tags WHERE file_id = ? AND tag_id = ? AND source = 'implied'");
  const ins = db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id, source) VALUES (?, ?, 'implied')");
  db.transaction(() => {
    for (const fileId of fileIds) {
      const manual = new Set(manualOf.all(fileId) as number[]);
      const want = new Set<number>();
      for (const m of manual) for (const t of closureOf(graph, m, memo)) if (!manual.has(t)) want.add(t);
      const have = new Set(impliedOf.all(fileId) as number[]);
      for (const t of have) if (!want.has(t)) del.run(fileId, t);
      for (const t of want) if (!have.has(t)) ins.run(fileId, t);
    }
  })();
}

/** How many images an implication change would touch (to ask first above a threshold). */
export function implicationImpact(lib: OpenLibrary, id: number, impliedId: number, action: 'add' | 'remove'): { affected: number } {
  const { db } = lib;
  const sql = action === 'add'
    // Images carrying the tag that don't have the implied one yet.
    ? `SELECT COUNT(DISTINCT a.file_id) FROM file_tags a JOIN files f ON f.id = a.file_id
       WHERE a.tag_id = ? AND ${LIVE_FILE} AND NOT EXISTS (SELECT 1 FROM file_tags b WHERE b.file_id = a.file_id AND b.tag_id = ?)`
    // Images carrying the tag where the implied one is only implied.
    : `SELECT COUNT(DISTINCT a.file_id) FROM file_tags a JOIN files f ON f.id = a.file_id
       WHERE a.tag_id = ? AND ${LIVE_FILE} AND EXISTS (SELECT 1 FROM file_tags b WHERE b.file_id = a.file_id AND b.tag_id = ? AND b.source = 'implied')`;
  return { affected: db.prepare(sql).pluck().get(id, impliedId) as number };
}

export function addImplication(lib: OpenLibrary, id: number, impliedId: number): TagDetail {
  const { db } = lib;
  const a = tagRow(lib, id);
  const b = tagRow(lib, impliedId);
  if (id === impliedId) throw badRequest('SELF_IMPLICATION', 'A tag can’t imply itself.');
  if (closureOf(implicationGraph(db), impliedId).has(id)) {
    throw conflict('IMPLICATION_CYCLE', `${b.name} already implies ${a.name} — that would make a loop.`);
  }
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id) VALUES (?, ?)').run(id, impliedId);
    recomputeImplied(db, filesWithTags(db, [id]));
  })();
  log('info', 'tags', 'implication added', { tag: a.name, implies: b.name });
  changed();
  return tagDetail(lib, id);
}

export function removeImplication(lib: OpenLibrary, id: number, impliedId: number): TagDetail {
  const { db } = lib;
  db.transaction(() => {
    db.prepare('DELETE FROM tag_implications WHERE tag_id = ? AND implied_tag_id = ?').run(id, impliedId);
    recomputeImplied(db, filesWithTags(db, [id, impliedId]));
  })();
  changed();
  return tagDetail(lib, id);
}

// ─── Merge (technical doc §10.6) ─────────────────────────────────────────────

/** Fold tags into `targetId`: images, aliases, implications, description and cover move over. */
export function mergeTags(lib: OpenLibrary, sourceIds: number[], targetId: number, keepAliases = true): TagDetail {
  const { db } = lib;
  const target = tagRow(lib, targetId);
  const sources = sourceIds.filter((s) => s !== targetId).map((s) => tagRow(lib, s));
  if (sources.length === 0) return tagDetail(lib, targetId);
  const touched = filesWithTags(db, [targetId, ...sources.map((s) => s.id)]);

  db.transaction(() => {
    for (const a of sources) {
      // 1. Images: B becomes manual where A was manual; A's links go.
      db.prepare(
        `INSERT INTO file_tags (file_id, tag_id, source) SELECT file_id, ?, 'manual' FROM file_tags WHERE tag_id = ? AND source = 'manual'
         ON CONFLICT (file_id, tag_id) DO UPDATE SET source = 'manual'`,
      ).run(targetId, a.id);
      db.prepare('DELETE FROM file_tags WHERE tag_id = ?').run(a.id);

      // 2. Aliases move to B's type; A's name becomes one too (unless they'd clash).
      const names = (db.prepare('SELECT alias FROM tag_aliases WHERE tag_id = ?').pluck().all(a.id) as string[]);
      db.prepare('DELETE FROM tag_aliases WHERE tag_id = ?').run(a.id);
      if (keepAliases) names.push(a.name);
      for (const alias of names) {
        const n = normTagName(alias);
        const clash = n === target.name_norm
          || db.prepare('SELECT 1 FROM tags WHERE type_id = ? AND name_norm = ? AND id <> ?').get(target.type_id, n, a.id)
          || db.prepare('SELECT 1 FROM tag_aliases WHERE type_id = ? AND alias_norm = ?').get(target.type_id, n);
        if (!clash) db.prepare('INSERT INTO tag_aliases (type_id, alias_norm, alias, tag_id) VALUES (?, ?, ?, ?)').run(target.type_id, n, alias, targetId);
      }

      // 3. Implications: A → X becomes B → X, X → A becomes X → B; no self-edges, no loops.
      db.prepare('INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id) SELECT ?, implied_tag_id FROM tag_implications WHERE tag_id = ? AND implied_tag_id <> ?').run(targetId, a.id, targetId);
      db.prepare('INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id) SELECT tag_id, ? FROM tag_implications WHERE implied_tag_id = ? AND tag_id <> ?').run(targetId, a.id, targetId);
      db.prepare('DELETE FROM tag_implications WHERE tag_id = ? OR implied_tag_id = ?').run(a.id, a.id);
      if (loopsBack(implicationGraph(db), targetId)) {
        throw conflict('IMPLICATION_CYCLE', `Merging ${a.name} into ${target.name} would make an implication loop.`);
      }

      // 5. Description and cover: B's win; empty ones take A's.
      db.prepare('UPDATE tags SET description = COALESCE(description, ?), cover_file_id = COALESCE(cover_file_id, ?), updated_at = ? WHERE id = ?')
        .run(a.description, a.cover_file_id, Date.now(), targetId);

      // 6. A goes (custom-field values arrive with milestone 5).
      db.prepare('DELETE FROM tags WHERE id = ?').run(a.id);
    }
    recomputeImplied(db, touched);
  })();

  log('info', 'tags', 'merge', { into: target.name, sources: sources.map((s) => s.name), keepAliases });
  changed();
  return tagDetail(lib, targetId);
}

// ─── Tags on images ──────────────────────────────────────────────────────────

export function tagsOfFile(db: DB, fileId: number): FileTag[] {
  return (db.prepare(
    `SELECT t.id, t.type_id, t.name, ft.source FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
     WHERE ft.file_id = ? ORDER BY t.name`,
  ).all(fileId) as { id: number; type_id: number; name: string; source: 'manual' | 'implied' }[])
    .map((r) => ({ ...ref(r), source: r.source }));
}

/**
 * Add and remove tags on images. Removing only removes the manual link: a tag also implied by
 * another one stays (as implied).
 */
export function changeFileTags(lib: OpenLibrary, fileIds: number[], add: number[], remove: number[]): { changed: number } {
  const { db } = lib;
  for (const id of [...add, ...remove]) tagRow(lib, id);
  const live = db.prepare('SELECT id FROM files WHERE id = ? AND recycled = 0').pluck();
  const files = fileIds.filter((id) => live.get(id) !== undefined);
  const ins = db.prepare("INSERT INTO file_tags (file_id, tag_id, source) VALUES (?, ?, 'manual') ON CONFLICT (file_id, tag_id) DO UPDATE SET source = 'manual'");
  const del = db.prepare("DELETE FROM file_tags WHERE file_id = ? AND tag_id = ? AND source = 'manual'");
  let n = 0;
  db.transaction(() => {
    for (const f of files) {
      for (const t of add) n += ins.run(f, t).changes;
      for (const t of remove) n += del.run(f, t).changes;
    }
    recomputeImplied(db, files);
  })();
  if (files.length > 1) log('info', 'tags', 'bulk tag change', { files: files.length, add, remove });
  changed();
  return { changed: n };
}

/** Copy a file's manual tags onto another (copies keep their tags). */
export function copyFileTags(db: DB, fromId: number, toId: number): void {
  db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id, source) SELECT ?, tag_id, 'manual' FROM file_tags WHERE file_id = ? AND source = 'manual'").run(toId, fromId);
  recomputeImplied(db, [toId]);
}

/** For the bulk tag dialog: the tags on any of the images, and on how many. */
export function tagCoverage(lib: OpenLibrary, fileIds: number[]): TagCoverage[] {
  if (fileIds.length === 0) return [];
  const rows = lib.db.prepare(
    `SELECT t.id, t.type_id, t.name, COUNT(*) AS n, MIN(ft.source = 'implied') AS implied_only
     FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
     WHERE ft.file_id IN (${fileIds.map(() => '?').join(',')})
     GROUP BY t.id ORDER BY n DESC, t.name`,
  ).all(...fileIds) as { id: number; type_id: number; name: string; n: number; implied_only: number }[];
  return rows.map((r) => ({ ...ref(r), count: r.n, impliedOnly: r.implied_only === 1 }));
}
