import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import os from 'node:os';
import type {
  ActiveProfile, ProfileInfo, ProfileLink, ProfilePrefs, ProfileRef, ProfileRole, ProfileTag,
} from '@media-view/shared';
import { loadConfig, updateConfig } from '../config.ts';
import type { DB } from '../db/connection.ts';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { log } from '../lib/log.ts';
import { thumbRef } from './folders.ts';
import type { OpenLibrary } from './library.ts';

/**
 * Local profiles (docs/profiles.md): who is using the library. A library always has at least one.
 * Profiles live in the library DB; the profile in use is `lib.profileId` (null = the picker), and the
 * services that care take it as `me`.
 */

interface ProfileRow {
  id: number;
  uuid: string;
  name: string;
  name_norm: string;
  picture_file_id: number | null;
  color: string;
  pass_hash: string | null;
  prefs: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
}

/** Initials backgrounds (docs/profiles.md §4.3), picked in turn for new profiles. */
export const PROFILE_COLORS = ['#ff4b2b', '#3d8bfd', '#2fb67c', '#c56cf0', '#f5a623', '#16b8c4', '#e8578d', '#8d99ae'];

const NAME_MAX = 50;
/** Wrong passwords answer after this delay (a gate, not a vault: no lockout). */
export const WRONG_PASSWORD_DELAY_MS = 500;

// ─── Stars (docs/profiles.md §3.1, §6.2) ────────────────────────────────────

/** SQL: the image `f` is starred by `me` (false with no profile). */
export function starredByMe(me: number | undefined): string {
  return me === undefined ? '0' : `EXISTS (SELECT 1 FROM profile_favorites WHERE file_id = f.id AND profile_id = ${Math.trunc(me)})`;
}

/** SQL: the image `f` is starred by anyone — stars protect images for everybody. */
export const STARRED_ANY = 'EXISTS (SELECT 1 FROM profile_favorites WHERE file_id = f.id)';

/** Who starred each of these images (only the starred ones are in the map). */
export function starredBy(db: DB, fileIds: number[]): Map<number, ProfileRef[]> {
  const out = new Map<number, ProfileRef[]>();
  if (fileIds.length === 0) return out;
  const ids = [...new Set(fileIds)];
  const rows = db.prepare(
    `SELECT pf.file_id, p.id, p.name FROM profile_favorites pf JOIN profiles p ON p.id = pf.profile_id
     WHERE pf.file_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.name COLLATE NOCASE`,
  ).all(...ids) as { file_id: number; id: number; name: string }[];
  for (const r of rows) {
    const list = out.get(r.file_id) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.file_id, list);
  }
  return out;
}

/** Everyone who starred any of these images, once each. */
export function whoStarred(db: DB, fileIds: number[]): ProfileRef[] {
  const seen = new Map<number, ProfileRef>();
  for (const list of starredBy(db, fileIds).values()) for (const p of list) seen.set(p.id, p);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** "Felipe", "Felipe and Rubio", "Ana, Felipe and Rubio". */
export const namesList = (people: ProfileRef[]) => joinAnd(people.map((p) => p.name));

/** Star or unstar images as `me`. */
export function setStars(db: DB, me: number, ids: number[], starred: boolean): number {
  const add = db.prepare(
    "INSERT OR IGNORE INTO profile_favorites (profile_id, file_id, added_at) SELECT ?, id, ? FROM files WHERE id = ? AND recycled = 0",
  );
  const remove = db.prepare('DELETE FROM profile_favorites WHERE profile_id = ? AND file_id = ?');
  return db.transaction(() => ids.reduce((n, id) => n + (starred ? add.run(me, Date.now(), id) : remove.run(me, id)).changes, 0))();
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function rowOf(db: DB, id: number): ProfileRow {
  const r = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow | undefined;
  if (!r) throw notFound('PROFILE_NOT_FOUND', 'This profile no longer exists.');
  return r;
}

function info(lib: OpenLibrary, r: ProfileRow): ProfileInfo {
  const pic = r.picture_file_id === null ? undefined
    : lib.db.prepare('SELECT id, hash, mtime FROM files WHERE id = ? AND recycled = 0 AND missing_since IS NULL').get(r.picture_file_id) as
      { id: number; hash: string | null; mtime: number } | undefined;
  return {
    id: r.id,
    uuid: r.uuid,
    name: r.name,
    color: r.color,
    pictureFileId: pic ? r.picture_file_id : null,
    picture: pic ? thumbRef(pic) : null,
    hasPassword: r.pass_hash !== null,
    active: lib.profileId === r.id,
    lastUsedAt: r.last_used_at,
  };
}

/** Every profile, by name. */
export function listProfiles(lib: OpenLibrary): ProfileInfo[] {
  const rows = lib.db.prepare('SELECT * FROM profiles ORDER BY name COLLATE NOCASE, id').all() as ProfileRow[];
  return rows.map((r) => info(lib, r));
}

export function profileInfo(lib: OpenLibrary, id: number): ProfileInfo {
  return info(lib, rowOf(lib.db, id));
}

/** The profile in use, or 401 so the app shows the picker. */
export function requireMe(lib: OpenLibrary): number {
  if (lib.profileId === null) throw new AppError(401, 'PROFILE_REQUIRED', 'Choose a profile first.');
  return lib.profileId;
}

export function activeProfile(lib: OpenLibrary): ActiveProfile {
  const r = rowOf(lib.db, requireMe(lib));
  return { ...info(lib, r), prefs: parsePrefs(r.prefs), profileCount: count(lib.db) };
}

const count = (db: DB) => db.prepare('SELECT COUNT(*) FROM profiles').pluck().get() as number;

/** More than one profile: messages and logs say who (with one, they read as before profiles). */
export const isShared = (db: DB) => count(db) > 1;

/** For log lines (docs/profiles.md §7.1): who `me` is, only while the library has two or more profiles. */
export function logActor(lib: OpenLibrary): { uuid: string; name: string } | undefined {
  if (lib.profileId === null || count(lib.db) < 2) return undefined;
  return lib.db.prepare('SELECT uuid, name FROM profiles WHERE id = ?').get(lib.profileId) as { uuid: string; name: string } | undefined;
}

// ─── Names ───────────────────────────────────────────────────────────────────

/** Shown as typed (trimmed, whitespace collapsed); compared ignoring case and space vs. `_`. */
const displayName = (raw: string) => raw.normalize('NFC').replace(/\s+/g, ' ').trim();
export const normName = (raw: string) => displayName(raw).replace(/_/g, ' ').toLowerCase();

function nameProblem(name: string): string {
  if (!name) return 'A name is required.';
  if (name.length > NAME_MAX) return `Names can be up to ${NAME_MAX} characters.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Names can’t contain control characters.';
  return '';
}

function validName(db: DB, raw: string, self?: number): string {
  const name = displayName(raw);
  const problem = nameProblem(name);
  if (problem) throw badRequest('INVALID_NAME', problem);
  const taken = db.prepare('SELECT id, name FROM profiles WHERE name_norm = ?').get(normName(name)) as { id: number; name: string } | undefined;
  if (taken && taken.id !== self) throw conflict('NAME_TAKEN', `There's already a profile called “${taken.name}”.`);
  return name;
}

// ─── Passwords ───────────────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function derive(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$N$r$p$<salt b64>$<hash b64>` (docs/profiles.md §1.1). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(N), Number(r), Number(p), expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Refuse a protected profile unless its password is given, answering wrong ones after a fixed delay. */
async function unlock(r: ProfileRow, password: string | undefined): Promise<void> {
  if (r.pass_hash === null) return;
  if (password === undefined || password === '') throw new AppError(403, 'PASSWORD_REQUIRED', `“${r.name}” has a password.`);
  if (await checkPassword(password, r.pass_hash)) return;
  await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
  throw new AppError(403, 'WRONG_PASSWORD', 'Wrong password.');
}

function validPassword(raw: string): string {
  if (raw.length < 1) throw badRequest('INVALID_PASSWORD', 'The password can’t be empty.');
  if (raw.length > 200) throw badRequest('INVALID_PASSWORD', 'The password is too long.');
  return raw;
}

// ─── Opening and switching ───────────────────────────────────────────────────

/**
 * Which profile a library opens with (docs/profiles.md §4.1): the only one, or the last one used on
 * this computer, when it has no password; else none (the picker). Names the first profile on the way.
 */
export function initialProfile(lib: OpenLibrary): number | null {
  nameFirstProfile(lib);
  const rows = lib.db.prepare('SELECT id, uuid, pass_hash FROM profiles').all() as { id: number; uuid: string; pass_hash: string | null }[];
  const lastUuid = loadConfig().lastProfiles[lib.meta.id];
  const pick = rows.length === 1 ? rows[0] : rows.find((r) => r.uuid === lastUuid);
  if (!pick || pick.pass_hash !== null) return null;
  remember(lib, rowOf(lib.db, pick.id));
  return pick.id;
}

/** Migration 007 makes the first profile as "Me": it takes the Windows user's name, and this computer's theme. */
function nameFirstProfile(lib: OpenLibrary): void {
  const { db } = lib;
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'profiles.nameFirst'").get()) return;
  const first = db.prepare('SELECT * FROM profiles ORDER BY id LIMIT 1').get() as ProfileRow | undefined;
  db.transaction(() => {
    if (first) {
      let name = first.name;
      try {
        const user = displayName(os.userInfo().username);
        if (!nameProblem(user) && !db.prepare('SELECT 1 FROM profiles WHERE name_norm = ? AND id <> ?').get(normName(user), first.id)) name = user;
      } catch {
        // no user name available: stays "Me"
      }
      const prefs = { ...parsePrefs(first.prefs), theme: loadConfig().ui.theme };
      db.prepare('UPDATE profiles SET name = ?, name_norm = ?, prefs = ?, updated_at = ? WHERE id = ?')
        .run(name, normName(name), JSON.stringify(prefs), Date.now(), first.id);
      const favorites = db.prepare('SELECT COUNT(*) FROM profile_favorites WHERE profile_id = ?').pluck().get(first.id) as number;
      log('info', 'profiles', 'first profile created', { uuid: first.uuid, name, favorites });
    }
    db.prepare("DELETE FROM settings WHERE key = 'profiles.nameFirst'").run();
  })();
}

/** Remember the profile in use on this computer, with its theme (the picker shows it, docs/profiles.md §4.1). */
function remember(lib: OpenLibrary, r: ProfileRow): void {
  lib.db.prepare('UPDATE profiles SET last_used_at = ? WHERE id = ?').run(Date.now(), r.id);
  const theme = parsePrefs(r.prefs).theme;
  updateConfig((c) => {
    c.lastProfiles = { ...c.lastProfiles, [lib.meta.id]: r.uuid };
    if (theme) c.ui.theme = theme;
  });
}

export async function switchProfile(lib: OpenLibrary, id: number, password?: string): Promise<ActiveProfile> {
  const r = rowOf(lib.db, id);
  await unlock(r, password);
  lib.profileId = r.id;
  remember(lib, r);
  emit({ type: 'profile-changed' });
  return activeProfile(lib);
}

/** Back to the picker (only useful for a profile with a password, but always allowed). */
export function lockProfile(lib: OpenLibrary): void {
  lib.profileId = null;
  emit({ type: 'profile-changed' });
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export async function createProfile(lib: OpenLibrary, input: { name: string; password?: string | null }): Promise<ProfileInfo> {
  const { db } = lib;
  const name = validName(db, input.name);
  const hash = input.password ? await hashPassword(validPassword(input.password)) : null;
  const color = PROFILE_COLORS[count(db) % PROFILE_COLORS.length]!;
  const now = Date.now();
  validName(db, name); // checked again after hashing: the name may have been taken meanwhile
  const id = db.prepare(
    'INSERT INTO profiles (uuid, name, name_norm, color, pass_hash, prefs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), name, normName(name), color, hash, JSON.stringify({ theme: loadConfig().ui.theme }), now, now).lastInsertRowid as number;
  log('info', 'profiles', 'profile created', { id, name, password: hash !== null });
  emit({ type: 'profile-updated' });
  return profileInfo(lib, id);
}

/** Name, picture and color of the profile in use. */
export function updateProfile(lib: OpenLibrary, me: number, change: { name?: string; pictureFileId?: number | null; color?: string }): ActiveProfile {
  const { db } = lib;
  const r = rowOf(db, me);
  db.transaction(() => {
    if (change.name !== undefined) {
      const name = validName(db, change.name, me);
      db.prepare('UPDATE profiles SET name = ?, name_norm = ? WHERE id = ?').run(name, normName(name), me);
      if (name !== r.name) log('info', 'profiles', 'profile renamed', { uuid: r.uuid, from: r.name, to: name });
    }
    if (change.pictureFileId !== undefined) {
      if (change.pictureFileId !== null
        && !db.prepare("SELECT 1 FROM files WHERE id = ? AND recycled = 0 AND missing_since IS NULL AND media_type = 'image'").get(change.pictureFileId)) {
        throw notFound('FILE_NOT_FOUND', 'This image is no longer in the library.');
      }
      db.prepare('UPDATE profiles SET picture_file_id = ? WHERE id = ?').run(change.pictureFileId, me);
    }
    if (change.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(change.color)) throw badRequest('INVALID_COLOR', 'Colors are written #RRGGBB.');
      db.prepare('UPDATE profiles SET color = ? WHERE id = ?').run(change.color.toLowerCase(), me);
    }
    db.prepare('UPDATE profiles SET updated_at = ? WHERE id = ?').run(Date.now(), me);
  })();
  emit({ type: 'profile-updated' });
  return activeProfile(lib);
}

/** Set, change or remove (`next: null`) the password of the profile in use; the current one is asked when there is one. */
export async function setPassword(lib: OpenLibrary, me: number, current: string | undefined, next: string | null): Promise<ActiveProfile> {
  const r = rowOf(lib.db, me);
  await unlock(r, current);
  const hash = next === null ? null : await hashPassword(validPassword(next));
  lib.db.prepare('UPDATE profiles SET pass_hash = ?, updated_at = ? WHERE id = ?').run(hash, Date.now(), me);
  log('info', 'profiles', next === null ? 'password removed' : r.pass_hash ? 'password changed' : 'password set', { uuid: r.uuid });
  emit({ type: 'profile-updated' });
  return activeProfile(lib);
}

/**
 * Delete another profile (docs/profiles.md §4.5): its stars, links and preferences go; images, tags
 * and collections stay. Never the last one, nor the one in use; a protected one needs its password.
 */
export async function deleteProfile(lib: OpenLibrary, me: number, id: number, password?: string): Promise<void> {
  const { db } = lib;
  const r = rowOf(db, id);
  if (id === me) throw conflict('PROFILE_IN_USE', 'Switch to another profile to delete this one.');
  if (count(db) <= 1) throw conflict('LAST_PROFILE', 'A library always keeps at least one profile.');
  await unlock(r, password);
  const favorites = db.prepare('SELECT COUNT(*) FROM profile_favorites WHERE profile_id = ?').pluck().get(id) as number;
  const links = db.prepare('SELECT COUNT(*) FROM profile_tags WHERE profile_id = ?').pluck().get(id) as number;
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  updateConfig((c) => {
    if (c.lastProfiles[lib.meta.id] === r.uuid) delete c.lastProfiles[lib.meta.id];
  });
  log('info', 'profiles', 'profile deleted', { uuid: r.uuid, name: r.name, favorites, links });
  emit({ type: 'files-changed' });
  emit({ type: 'profile-updated' });
}

/** What deleting a profile removes, for the confirmation. */
export function deleteImpact(lib: OpenLibrary, id: number): { favorites: number; links: number } {
  rowOf(lib.db, id);
  return {
    favorites: lib.db.prepare('SELECT COUNT(*) FROM profile_favorites WHERE profile_id = ?').pluck().get(id) as number,
    links: lib.db.prepare('SELECT COUNT(*) FROM profile_tags WHERE profile_id = ?').pluck().get(id) as number,
  };
}

// ─── Preferences ─────────────────────────────────────────────────────────────

function parsePrefs(raw: string): ProfilePrefs {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as ProfilePrefs) : {};
  } catch {
    return {};
  }
}

/** Merge a change into the preferences of the profile in use; the theme also becomes this computer's (the picker's). */
export function updatePrefs(lib: OpenLibrary, me: number, change: ProfilePrefs): ProfilePrefs {
  const r = rowOf(lib.db, me);
  const { _import: _, ...clean } = change;
  const prefs = { ...parsePrefs(r.prefs), ...clean };
  lib.db.prepare('UPDATE profiles SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), me);
  if (clean.theme) updateConfig((c) => void (c.ui.theme = clean.theme!));
  return prefs;
}

/**
 * The browser's saved preferences, handed over once after the upgrade (docs/profiles.md §6.1): taken
 * only while the `_import` marker is there; what the profile already has wins.
 */
export function importPrefs(lib: OpenLibrary, me: number, saved: ProfilePrefs): ProfilePrefs {
  const r = rowOf(lib.db, me);
  const current = parsePrefs(r.prefs);
  if (!current._import) return current;
  const { _import: _, theme: __, ...fromBrowser } = saved;
  const { _import: ___, ...rest } = current;
  const prefs = { ...fromBrowser, ...rest };
  lib.db.prepare('UPDATE profiles SET prefs = ? WHERE id = ?').run(JSON.stringify(prefs), me);
  log('info', 'profiles', 'preferences imported', { uuid: r.uuid, keys: Object.keys(fromBrowser) });
  return prefs;
}

// ─── Tag links (docs/profiles.md §5) ─────────────────────────────────────────

export function profileTags(lib: OpenLibrary, id: number): ProfileTag[] {
  rowOf(lib.db, id);
  return lib.db.prepare(
    `SELECT t.id, t.type_id AS typeId, t.name, tt.key AS typeKey, pt.role
     FROM profile_tags pt JOIN tags t ON t.id = pt.tag_id JOIN tag_types tt ON tt.id = t.type_id
     WHERE pt.profile_id = ? ORDER BY pt.role, t.name COLLATE NOCASE`,
  ).all(id) as ProfileTag[];
}

/** Who a tag is linked to (the wiki's *Linked to* line). */
export function tagLinks(db: DB, tagId: number): ProfileLink[] {
  const rows = db.prepare(
    'SELECT p.id, p.name, pt.role FROM profile_tags pt JOIN profiles p ON p.id = pt.profile_id WHERE pt.tag_id = ? ORDER BY pt.role',
  ).all(tagId) as { id: number; name: string; role: ProfileRole }[];
  return rows.map((r) => ({ profile: { id: r.id, name: r.name }, role: r.role }));
}

const ROLE_WORD: Record<ProfileRole, string> = { creator: 'creator', subject: 'subject' };

/** Link a tag to the profile in use. A tag has one profile per role. */
export function linkTag(lib: OpenLibrary, me: number, tagId: number, role: ProfileRole): ProfileTag[] {
  const { db } = lib;
  const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(tagId) as { name: string } | undefined;
  if (!tag) throw notFound('TAG_NOT_FOUND', 'This tag no longer exists.');
  const other = db.prepare('SELECT p.id, p.name FROM profile_tags pt JOIN profiles p ON p.id = pt.profile_id WHERE pt.tag_id = ? AND pt.role = ?')
    .get(tagId, role) as { id: number; name: string } | undefined;
  if (other && other.id !== me) {
    throw conflict('TAG_LINKED', `“${tag.name}” is already linked to ${other.name} as ${ROLE_WORD[role]}.`);
  }
  if (!other) {
    db.prepare('INSERT INTO profile_tags (tag_id, role, profile_id, created_at) VALUES (?, ?, ?, ?)').run(tagId, role, me, Date.now());
    emit({ type: 'profile-updated' });
  }
  return profileTags(lib, me);
}

export function unlinkTag(lib: OpenLibrary, me: number, tagId: number, role: ProfileRole): ProfileTag[] {
  if (lib.db.prepare('DELETE FROM profile_tags WHERE tag_id = ? AND role = ? AND profile_id = ?').run(tagId, role, me).changes) {
    emit({ type: 'profile-updated' });
  }
  return profileTags(lib, me);
}
