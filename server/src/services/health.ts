import fs from 'node:fs';
import path from 'node:path';
import {
  isImageFile,
  type DuplicateCopy, type DuplicateReason, type FileItem, type FixAction, type FixResult, type FolderKind, type HealthIssue,
  type HealthReport, type HealthSummary, type IssueDetails, type IssueKind, type TagRef, type ThumbRef,
} from '@media-view/shared';
import type { DB } from '../db/connection.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { emit } from '../lib/events.ts';
import { expectChange } from '../lib/expected.ts';
import { hashFile } from '../lib/hash.ts';
import { clearLogs, log, logStats } from '../lib/log.ts';
import { writeMarker } from '../lib/markers.ts';
import { splitExt, uniqueName } from '../lib/names.ts';
import { DATA_DIR, toAbsolute, toDbPath } from '../lib/paths.ts';
import { requestScan, scanStatus } from '../workers/scanner.ts';
import { folderPath, renumber } from './collections.ts';
import { categoryIdOf, moveFiles } from './file-ops.ts';
import { fileItems, UNTAGGED } from './files.ts';
import { assertCanHold, createFolder, kindAt, liveFolder, relocate, thumbRef } from './folders.ts';
import { clearIssue, raiseIssue, SEVERITY } from './issues.ts';
import type { OpenLibrary } from './library.ts';
import { recycleFiles, recycleStray } from './recycle.ts';
import { recomputeImplied } from './tags.ts';
import { thumbDir } from './thumbnails.ts';

/**
 * Library Health (technical doc §7.4, user guide §4.15, milestone 7): the report behind the page and
 * the badge, the untagged images, and every fix. Fixes go through the normal operations (disk first,
 * then the DB), are logged, and clear their issue; a scan afterwards re-raises whatever still applies.
 */

interface IssueRow {
  id: number;
  kind: IssueKind;
  severity: 'error' | 'warning' | 'info';
  subject: string;
  payload: string;
  detected_at: number;
}

const LIVE = "f.recycled = 0 AND f.missing_since IS NULL AND f.media_type = 'image'";
const OUTSIDE_INBOX = "f.folder_id NOT IN (SELECT id FROM folders WHERE kind = 'inbox')";

function changed(): void {
  emit({ type: 'health-changed' });
  emit({ type: 'files-changed' });
  emit({ type: 'folders-changed' });
}

const issueRow = (db: DB, id: number): IssueRow => {
  const r = db.prepare('SELECT * FROM health_issues WHERE id = ?').get(id) as IssueRow | undefined;
  if (!r) throw notFound('ISSUE_NOT_FOUND', 'This item was already fixed (or the last scan cleared it).');
  return r;
};

// ─── Summary and report ──────────────────────────────────────────────────────

export function healthSummary(lib: OpenLibrary): HealthSummary {
  const { db } = lib;
  const counts = Object.fromEntries(
    (db.prepare('SELECT severity, COUNT(*) AS n FROM health_issues GROUP BY severity').all() as { severity: string; n: number }[])
      .map((r) => [r.severity, r.n]),
  ) as Record<string, number>;
  const untagged = db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(f.origin = 'scan' AND f.seen = 0), 0) AS fresh FROM files f WHERE ${LIVE} AND ${OUTSIDE_INBOX} AND ${UNTAGGED}`,
  ).get() as { n: number; fresh: number };
  // Items shown inside another item (a missing folder's contents, unclear-move candidates) don't count twice.
  const hidden = hiddenIssues(db);
  const visible = (severity: string) => (counts[severity] ?? 0) - (hidden.bySeverity.get(severity) ?? 0);
  return {
    error: visible('error'), warning: visible('warning'), info: visible('info'), notice: visible('notice'),
    untagged: untagged.n, fresh: untagged.fresh,
  };
}

/**
 * Issues shown inside another one (design flags 4–6): the folders and images inside a missing folder
 * belong to its item, and missing images that are candidates of an unclear move show only there.
 */
function hiddenIssues(db: DB): { ids: Set<number>; bySeverity: Map<string, number> } {
  const rows = db.prepare("SELECT id, kind, severity, subject, payload FROM health_issues WHERE kind IN ('missing_folder', 'missing_file', 'ambiguous_move')").all() as IssueRow[];
  const missingFolders = rows.filter((r) => r.kind === 'missing_folder')
    .map((r) => db.prepare('SELECT rel_path FROM folders WHERE id = ?').pluck().get(Number(r.subject.slice('folder:'.length))) as string | undefined)
    .filter((p): p is string => !!p)
    .map((p) => p.toLowerCase() + '/');
  const under = (relPath: string) => missingFolders.some((prefix) => relPath.toLowerCase().startsWith(prefix));
  const candidates = new Set(rows.filter((r) => r.kind === 'ambiguous_move').flatMap((r) => (JSON.parse(r.payload).candidates as { id: number }[]).map((c) => c.id)));
  const ids = new Set<number>();
  for (const r of rows) {
    const p = JSON.parse(r.payload) as { path?: string; fileId?: number };
    if (r.kind === 'missing_folder' && p.path && under(p.path)) ids.add(r.id);
    if (r.kind === 'missing_file' && ((p.path && under(p.path)) || (p.fileId !== undefined && candidates.has(p.fileId)))) ids.add(r.id);
  }
  const bySeverity = new Map<string, number>();
  for (const r of rows) if (ids.has(r.id)) bySeverity.set(r.severity, (bySeverity.get(r.severity) ?? 0) + 1);
  return { ids, bySeverity };
}

const ORDER: IssueKind[] = [
  'missing_folder', 'missing_file', 'external_move', 'ambiguous_move', 'loose_files', 'nested_in_album', 'unmarked_folder',
  'unsupported', 'wrong_type', 'duplicate', 'moved_file',
];

export function healthReport(lib: OpenLibrary): HealthReport {
  const { db } = lib;
  const rows = db.prepare('SELECT * FROM health_issues ORDER BY detected_at, id').all() as IssueRow[];
  const hidden = hiddenIssues(db).ids;
  const issues: HealthIssue[] = [];
  for (const r of rows) {
    if (r.kind === 'orphan_thumbs' || hidden.has(r.id)) continue; // thumbnails are computed live below
    try {
      const details = describe(lib, r);
      if (details) issues.push({ id: r.id, kind: r.kind, severity: r.severity, detectedAt: r.detected_at, details });
    } catch (err) {
      log('warn', 'health', 'could not describe issue', { id: r.id, kind: r.kind, message: (err as Error).message });
    }
  }
  issues.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.detectedAt - b.detectedAt);
  const untaggedAlbums = (db.prepare(
    `SELECT fo.id, fo.rel_path, COUNT(*) AS n, SUM(f.origin = 'scan' AND f.seen = 0) AS fresh
     FROM files f JOIN folders fo ON fo.id = f.folder_id
     WHERE ${LIVE} AND ${OUTSIDE_INBOX} AND ${UNTAGGED} GROUP BY fo.id ORDER BY n DESC, fo.rel_path`,
  ).all() as { id: number; rel_path: string; n: number; fresh: number }[])
    .map((r) => ({ folderId: r.id, path: folderPath(r.rel_path), count: r.n, fresh: r.fresh }));
  const orphans = orphanThumbnails(lib);
  const left = db.prepare(`SELECT COUNT(*) FROM files f WHERE ${LIVE} AND ${OUTSIDE_INBOX} AND f.untagged_ok = 1 AND NOT EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id)`)
    .pluck().get() as number;
  return {
    summary: healthSummary(lib),
    issues,
    untaggedAlbums,
    leftUntagged: left,
    untracked: (db.prepare('SELECT rel_path, ext, reason, ignored_at FROM untracked_files ORDER BY rel_path COLLATE NOCASE').all() as
      { rel_path: string; ext: string; reason: 'unsupported' | 'wrong_type'; ignored_at: number }[])
      .map((u) => ({ path: u.rel_path, ext: u.ext, reason: u.reason, ignoredAt: u.ignored_at })),
    formatStats: db.prepare('SELECT ext, ignored, recorded FROM format_stats ORDER BY ignored + recorded DESC, ext').all() as
      { ext: string; ignored: number; recorded: number }[],
    thumbnails: { count: orphans.files.length, bytes: orphans.bytes },
    logs: logStats(),
    lastScan: scanStatus(lib).lastScan,
  };
}

function manualTags(db: DB, fileId: number): TagRef[] {
  return db.prepare(
    `SELECT t.id, t.type_id AS typeId, t.name FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
     WHERE ft.file_id = ? AND ft.source = 'manual' ORDER BY t.name`,
  ).all(fileId) as TagRef[];
}

function fileBrief(db: DB, id: number) {
  return db.prepare('SELECT id, filename, rel_path, hash, mtime, favorited, description, folder_id, added_at FROM files WHERE id = ?').get(id) as
    | { id: number; filename: string; rel_path: string; hash: string | null; mtime: number; favorited: number; description: string | null; folder_id: number; added_at: number }
    | undefined;
}

const listCount = (db: DB, fileId: number) => db.prepare('SELECT COUNT(*) FROM collection_items WHERE file_id = ?').pluck().get(fileId) as number;
const thumbOf = (f: { id: number; hash: string | null; mtime: number } | undefined): ThumbRef | null => (f?.hash ? thumbRef(f) : null);

/** What the page shows for an issue; null when it no longer applies (left for the next scan to clear). */
function describe(lib: OpenLibrary, r: IssueRow): IssueDetails | null {
  const { db } = lib;
  const p = JSON.parse(r.payload) as Record<string, unknown>;
  switch (r.kind) {
    case 'missing_folder': {
      const id = Number(r.subject.slice('folder:'.length));
      const f = db.prepare('SELECT id, kind, name, rel_path FROM folders WHERE id = ?').get(id) as { id: number; kind: FolderKind; name: string; rel_path: string } | undefined;
      if (!f) return null;
      const images = db.prepare("SELECT COUNT(*) FROM files WHERE recycled = 0 AND (rel_path LIKE ? || '/%')").pluck().get(f.rel_path) as number;
      const folders = db.prepare("SELECT COUNT(*) FROM folders WHERE recycled = 0 AND missing_since IS NOT NULL AND rel_path LIKE ? || '/%'").pluck().get(f.rel_path) as number;
      return { kind: 'missing_folder', folderId: f.id, path: f.rel_path, folderKind: f.kind, name: f.name, images, folders };
    }
    case 'missing_file': {
      const f = fileBrief(db, Number(p.fileId));
      if (!f) return null;
      return {
        kind: 'missing_file', fileId: f.id, path: f.rel_path, filename: f.filename, thumb: thumbOf(f),
        tags: manualTags(db, f.id), favorited: f.favorited === 1, collections: listCount(db, f.id),
      };
    }
    case 'external_move': {
      if (p.entity === 'folder') {
        const f = db.prepare('SELECT id, name, rel_path FROM folders WHERE id = ?').get(Number(p.folderId)) as { id: number; name: string; rel_path: string } | undefined;
        if (!f) return null;
        return { kind: 'external_move', entity: 'folder', folderId: f.id, name: f.name, from: String(p.from), to: f.rel_path };
      }
      const files = (p.files as { id: number; from: string; to: string }[]).map((x) => {
        const f = fileBrief(db, x.id);
        return f ? { id: f.id, filename: f.filename, from: x.from, to: f.rel_path, thumb: thumbOf(f) } : null;
      }).filter((x) => !!x);
      if (!files.length) return null;
      const dir = (rel: string) => rel.slice(0, rel.lastIndexOf('/'));
      return { kind: 'external_move', entity: 'files', fromFolder: dir(files[0]!.from), toFolder: dir(files[0]!.to), files };
    }
    case 'ambiguous_move': {
      const f = fileBrief(db, Number(p.fileId));
      if (!f) return null;
      const candidates = (p.candidates as { id: number }[]).map((c) => fileBrief(db, c.id)).filter((c) => !!c).map((c) => ({
        id: c.id, path: c.rel_path, tags: manualTags(db, c.id), favorited: c.favorited === 1, collections: listCount(db, c.id), description: c.description,
      }));
      return { kind: 'ambiguous_move', file: { id: f.id, path: f.rel_path, thumb: thumbOf(f) }, candidates };
    }
    case 'loose_files': {
      const folderId = r.subject === 'root' ? null : Number(r.subject.slice('folder:'.length));
      const folder = folderId === null ? null : db.prepare('SELECT rel_path FROM folders WHERE id = ?').pluck().get(folderId) as string | undefined;
      if (folderId !== null && folder === undefined) return null;
      return { kind: 'loose_files', folderId, path: folder ?? '', count: Number(p.count), paths: p.paths as string[] };
    }
    case 'nested_in_album': {
      const album = db.prepare('SELECT id, rel_path FROM folders WHERE id = ?').get(Number(p.albumId)) as { id: number; rel_path: string } | undefined;
      if (!album) return null;
      const parent = album.rel_path.includes('/') ? album.rel_path.slice(0, album.rel_path.lastIndexOf('/')) : '';
      return { kind: 'nested_in_album', path: String(p.path), albumId: album.id, albumPath: album.rel_path, moveOutTo: parent };
    }
    case 'unmarked_folder': {
      const f = db.prepare('SELECT id, kind, rel_path, parent_id FROM folders WHERE id = ? AND recycled = 0').get(Number(p.folderId)) as
        { id: number; kind: FolderKind; rel_path: string; parent_id: number | null } | undefined;
      if (!f) return null;
      const images = db.prepare('SELECT COUNT(*) FROM files WHERE folder_id = ? AND recycled = 0').pluck().get(f.id) as number;
      const folders = db.prepare('SELECT COUNT(*) FROM folders WHERE parent_id = ? AND recycled = 0').pluck().get(f.id) as number;
      return {
        kind: 'unmarked_folder', folderId: f.id, path: f.rel_path, current: f.kind, inferred: p.inferred as FolderKind,
        certain: p.certain === true, images, folders, topLevel: f.parent_id === null,
      };
    }
    case 'wrong_type': {
      const unreadable = r.subject.startsWith('file:');
      const filePath = String(p.path);
      const ext = String(p.ext ?? filePath.slice(filePath.lastIndexOf('.') + 1));
      return { kind: 'wrong_type', path: filePath, ext, fileId: unreadable ? Number(p.fileId) : null, unreadable };
    }
    case 'unsupported':
      return { kind: 'unsupported', path: String(p.path), ext: String(p.ext) };
    case 'moved_file':
      return { kind: 'moved_file', from: String(p.from), to: String(p.to), module: p.module as 'videos' | 'audio' | 'texts' };
    case 'duplicate':
      return describeDuplicate(db, r.subject.slice('hash:'.length));
    default:
      return null;
  }
}

function describeDuplicate(db: DB, hash: string): IssueDetails | null {
  const rows = db.prepare(
    `SELECT id, rel_path, folder_id, favorited, description, added_at, mtime, hash FROM files f WHERE hash = ? AND ${LIVE} ORDER BY added_at, id`,
  ).all(hash) as { id: number; rel_path: string; folder_id: number; favorited: number; description: string | null; added_at: number; mtime: number; hash: string }[];
  if (rows.length < 2) return null;
  const copies: DuplicateCopy[] = rows.map((r) => ({
    id: r.id,
    path: r.rel_path,
    folderId: r.folder_id,
    tags: manualTags(db, r.id),
    favorited: r.favorited === 1,
    collections: db.prepare('SELECT c.id, c.name FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE ci.file_id = ? ORDER BY c.name')
      .all(r.id) as { id: number; name: string }[],
    description: r.description,
    addedAt: r.added_at,
  }));
  const { keepId, reason } = suggestKeep(copies);
  return { kind: 'duplicate', hash, thumb: thumbRef(rows[0]!), copies, keepId, reason };
}

/**
 * Which copy to keep (technical doc §7.4, milestone 7 decisions): never one that would lose tags;
 * a starred copy (they can't be recycled); the only tagged one; else the oldest. Copies with different
 * tags, or two starred copies, have no default — only "different-tags" may still suggest the starred
 * copy, and Apply to all skips both. `copies` come oldest first.
 */
export function suggestKeep(copies: DuplicateCopy[]): { keepId: number | null; reason: DuplicateReason } {
  const starred = copies.filter((c) => c.favorited);
  if (starred.length >= 2) return { keepId: null, reason: 'two-starred' };
  const all = new Set(copies.flatMap((c) => c.tags.map((t) => t.id)));
  const safe = copies.filter((c) => [...all].every((t) => c.tags.some((x) => x.id === t)));
  // One starred copy among copies with different tags: it's the suggestion, but the group still asks.
  if (starred.length === 1) return { keepId: starred[0]!.id, reason: safe.includes(starred[0]!) ? 'starred' : 'different-tags' };
  if (all.size === 0) return { keepId: copies[0]!.id, reason: 'oldest' };
  if (safe.length === 0) return { keepId: null, reason: 'different-tags' };
  const tagged = copies.filter((c) => c.tags.length > 0);
  return tagged.length === 1 ? { keepId: tagged[0]!.id, reason: 'only-tagged' } : { keepId: safe[0]!.id, reason: 'oldest' };
}

// ─── Untagged images ─────────────────────────────────────────────────────────

/** The untagged images for the Health page, album by album (or one album), newest arrivals marked. */
export function untaggedImages(
  lib: OpenLibrary, opts: { fresh?: boolean; left?: boolean; folder?: number; offset?: number; limit?: number },
): { items: (FileItem & { where: string })[]; total: number } {
  // `left`: the ones set aside with "Leave untagged" instead (the "Left untagged (n)" list).
  const where = [LIVE, OUTSIDE_INBOX, opts.left ? 'f.untagged_ok = 1 AND NOT EXISTS (SELECT 1 FROM file_tags WHERE file_id = f.id)' : UNTAGGED];
  const params: unknown[] = [];
  if (opts.fresh) where.push("f.origin = 'scan' AND f.seen = 0");
  if (opts.folder !== undefined) {
    where.push('f.folder_id = ?');
    params.push(opts.folder);
  }
  const from = `files f JOIN folders fo ON fo.id = f.folder_id WHERE ${where.join(' AND ')}`;
  const total = lib.db.prepare(`SELECT COUNT(*) FROM ${from}`).pluck().get(...params) as number;
  const rows = lib.db.prepare(
    `SELECT f.id, fo.rel_path FROM ${from} ORDER BY fo.rel_path COLLATE NOCASE, f.filename COLLATE NOCASE LIMIT ? OFFSET ?`,
  ).all(...params, Math.min(500, opts.limit ?? 200), Math.max(0, opts.offset ?? 0)) as { id: number; rel_path: string }[];
  const folderOf = new Map(rows.map((x) => [x.id, x.rel_path]));
  const items = fileItems(lib, rows.map((x) => x.id)).map((item) => ({ ...item, where: folderPath(folderOf.get(item.id) ?? '') }));
  return { items, total };
}

/** Mark as seen (clears NEW; the image stays on the list) or Leave untagged (takes it off the list). */
export function setUntaggedFlags(lib: OpenLibrary, ids: number[] | 'all', action: 'seen' | 'leave' | 'put-back'): { changed: number } {
  const { db } = lib;
  const column = action === 'seen' ? 'seen = 1' : action === 'leave' ? 'untagged_ok = 1' : 'untagged_ok = 0';
  let n: number;
  if (ids === 'all') {
    const scope = action === 'seen' ? `${UNTAGGED} AND f.origin = 'scan' AND f.seen = 0`
      : action === 'leave' ? UNTAGGED
      : 'f.untagged_ok = 1';
    n = db.prepare(`UPDATE files AS f SET ${column} WHERE ${LIVE} AND ${OUTSIDE_INBOX} AND ${scope}`).run().changes;
  } else {
    const one = db.prepare(`UPDATE files SET ${column} WHERE id = ?`);
    n = db.transaction(() => ids.reduce((sum, id) => sum + one.run(id).changes, 0))();
  }
  log('info', 'health', action === 'seen' ? 'marked as seen' : action === 'leave' ? 'left untagged' : 'put back on the untagged list', { images: n });
  changed();
  return { changed: n };
}

// ─── Thumbnail cleanup and logs ──────────────────────────────────────────────

/** Cached thumbnails that no image (live, missing or in the bin) uses any more. */
function orphanThumbnails(lib: OpenLibrary): { files: string[]; bytes: number } {
  const dir = thumbDir(lib);
  if (!fs.existsSync(dir)) return { files: [], bytes: 0 };
  const hashes = new Set(lib.db.prepare('SELECT DISTINCT hash FROM files WHERE hash IS NOT NULL').pluck().all() as string[]);
  const unhashed = new Set((lib.db.prepare('SELECT id FROM files WHERE hash IS NULL').pluck().all() as number[]).map(String));
  const files: string[] = [];
  let bytes = 0;
  for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const subDir = path.join(dir, sub.name);
    for (const name of fs.readdirSync(subDir)) {
      const stem = name.replace(/\.webp$/, '');
      const used = sub.name === 'tmp' ? unhashed.has(stem) : hashes.has(stem);
      if (used) continue;
      const file = path.join(subDir, name);
      try {
        bytes += fs.statSync(file).size;
        files.push(file);
      } catch {
        // gone meanwhile
      }
    }
  }
  return { files, bytes };
}

export function cleanThumbnails(lib: OpenLibrary): { deleted: number; bytes: number } {
  const { files, bytes } = orphanThumbnails(lib);
  for (const f of files) fs.rmSync(f, { force: true });
  log('info', 'health', 'thumbnail cleanup', { deleted: files.length, bytes });
  emit({ type: 'health-changed' });
  return { deleted: files.length, bytes };
}

export function clearLogFiles(): { files: number; bytes: number } {
  const before = logStats();
  clearLogs();
  return before;
}

// ─── Fixes ───────────────────────────────────────────────────────────────────

/** Apply one fix to one issue. */
export async function fixIssue(lib: OpenLibrary, issueId: number, fix: FixAction): Promise<FixResult> {
  const { db } = lib;
  const r = issueRow(db, issueId);
  const p = JSON.parse(r.payload) as Record<string, unknown>;
  const dismiss = (message: string): FixResult => {
    clearIssue(db, r.kind, r.subject);
    return { message, reopen: { kind: r.kind, subject: r.subject, payload: r.payload } };
  };
  const done = (message: string): FixResult => {
    clearIssue(db, r.kind, r.subject);
    return { message };
  };
  let result: FixResult;

  switch (`${r.kind}:${fix.action}`) {
    case 'missing_folder:recreate':
      result = done(recreateFolder(lib, Number(r.subject.slice('folder:'.length))));
      break;
    case 'missing_folder:forget':
      result = done(forgetFolder(lib, Number(r.subject.slice('folder:'.length))));
      break;
    case 'missing_file:locate':
      result = done(await locateFile(lib, Number(p.fileId), (fix as { path: string }).path));
      break;
    case 'missing_file:forget':
      result = done(forgetFile(lib, Number(p.fileId)));
      break;
    case 'external_move:keep':
      result = dismiss('Kept the change.');
      break;
    case 'external_move:undo':
      result = undoExternalMove(lib, r, p);
      break;
    case 'ambiguous_move:pick':
      result = done(pickCandidate(lib, Number(p.fileId), (fix as { candidateId: number }).candidateId, p.candidates as { id: number }[]));
      break;
    case 'ambiguous_move:keep-new':
      result = dismiss('Kept it as a new image.');
      break;
    case 'loose_files:new-album':
      result = done(placeLoose(lib, r.subject, { name: (fix as { name: string }).name }));
      break;
    case 'loose_files:into-album':
      result = done(placeLoose(lib, r.subject, { albumId: (fix as { albumId: number | null }).albumId }));
      break;
    case 'nested_in_album:move-out':
      result = done(moveOutOfAlbum(lib, String(p.path), Number(p.albumId)));
      break;
    case 'nested_in_album:convert':
      result = done(convertAlbum(lib, Number(p.albumId), (fix as { name: string }).name));
      break;
    case 'unmarked_folder:confirm': {
      const message = confirmKind(lib, Number(p.folderId), (fix as { folderKind?: FolderKind }).folderKind);
      result = dismiss(message);
      break;
    }
    case 'wrong_type:recycle':
      result = done(recycleWrongType(lib, r.subject, p));
      break;
    case 'wrong_type:ignore':
    case 'unsupported:ignore':
      if (r.subject.startsWith('file:')) throw badRequest('INVALID_FIX', 'An image the app can’t read can only be recycled.');
      result = done(ignoreFile(lib, String(p.path), r.kind === 'unsupported' ? 'unsupported' : 'wrong_type'));
      break;
    case 'unsupported:record':
      result = done(recordFile(lib, String(p.path)));
      break;
    case 'moved_file:ok':
      result = done('OK.');
      break;
    case 'duplicate:keep-one':
      result = done(resolveDuplicate(lib, r.subject.slice('hash:'.length), (fix as { keepId: number }).keepId, false));
      break;
    case 'duplicate:merge':
      result = done(resolveDuplicate(lib, r.subject.slice('hash:'.length), (fix as { keepId: number }).keepId, true));
      break;
    default:
      throw badRequest('INVALID_FIX', `“${fix.action}” isn’t a fix for this item.`);
  }
  log('info', 'health', 'fix applied', { kind: r.kind, subject: r.subject, action: fix.action, message: result.message });
  changed();
  return result;
}

/** Bring back an issue that a dismissing fix cleared (the toast's Undo). */
export function reopenIssue(lib: OpenLibrary, issue: { kind: IssueKind; subject: string; payload: string }): void {
  if (!(issue.kind in SEVERITY)) throw badRequest('INVALID_KIND', 'Unknown issue kind.');
  lib.db.prepare(
    `INSERT INTO health_issues (kind, severity, subject, payload, detected_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (kind, subject) DO NOTHING`,
  ).run(issue.kind, SEVERITY[issue.kind], issue.subject, issue.payload, Date.now());
  emit({ type: 'health-changed' });
}

/** The fixes "Apply to all" can do per kind: the ones that need no further choice. */
const FIX_ALL: Partial<Record<IssueKind, FixAction['action'][]>> = {
  missing_folder: ['recreate', 'forget'],
  missing_file: ['forget'],
  external_move: ['keep', 'undo'],
  loose_files: ['new-album'],
  nested_in_album: ['move-out'],
  unmarked_folder: ['confirm'],
  wrong_type: ['recycle', 'ignore'],
  unsupported: ['ignore', 'record'],
  duplicate: ['keep-one'],
  moved_file: ['ok'],
};

/** Apply to all across the page (red and amber only): the default fix for each kind that has one. */
const EVERYTHING: [IssueKind, FixAction['action']][] = [
  ['missing_folder', 'recreate'],
  ['external_move', 'keep'],
  ['nested_in_album', 'move-out'],
  ['unmarked_folder', 'confirm'],
  ['loose_files', 'new-album'],
];
const NEEDS_CHOICE: IssueKind[] = ['missing_file', 'ambiguous_move', 'unsupported', 'wrong_type'];

export async function fixEverything(lib: OpenLibrary): Promise<{ done: number; skipped: number; failed: { id: number; message: string }[] }> {
  const out = { done: 0, skipped: 0, failed: [] as { id: number; message: string }[] };
  for (const [kind, action] of EVERYTHING) {
    const r = await fixAll(lib, kind, action);
    out.done += r.done;
    out.skipped += r.skipped;
    out.failed.push(...r.failed);
  }
  const hidden = hiddenIssues(lib.db).ids;
  const waiting = lib.db.prepare(`SELECT id FROM health_issues WHERE kind IN (${NEEDS_CHOICE.map(() => '?').join(',')})`).pluck().all(...NEEDS_CHOICE) as number[];
  out.skipped += waiting.filter((id) => !hidden.has(id)).length;
  return out;
}

/** A free name for a new album of loose images in a folder: "Loose images", then "Loose images (2)"… */
function looseAlbumName(lib: OpenLibrary, subject: string): string {
  if (subject === 'root') return 'Loose images';
  const folder = liveFolder(lib, Number(subject.slice('folder:'.length)));
  const dir = toAbsolute(lib.moduleRoot('images'), folder.rel_path);
  for (let n = 1; ; n++) {
    const name = n === 1 ? 'Loose images' : `Loose images (${n})`;
    if (!fs.existsSync(path.join(dir, name))) return name;
  }
}

/** Apply a fix to every issue of a kind; ones that need a choice (or fail) are skipped and reported. */
export async function fixAll(lib: OpenLibrary, kind: IssueKind, action: FixAction['action']): Promise<{ done: number; skipped: number; failed: { id: number; message: string }[] }> {
  if (!FIX_ALL[kind]?.includes(action)) throw badRequest('INVALID_FIX', 'This fix can’t be applied to all at once.');
  // Items shown inside another one are fixed with it (a missing folder's contents), not on their own.
  const hidden = hiddenIssues(lib.db).ids;
  const rows = (lib.db.prepare('SELECT * FROM health_issues WHERE kind = ? ORDER BY id').all(kind) as IssueRow[]).filter((r) => !hidden.has(r.id));
  const out = { done: 0, skipped: 0, failed: [] as { id: number; message: string }[] };
  for (const r of rows) {
    if (!lib.db.prepare('SELECT 1 FROM health_issues WHERE id = ?').get(r.id)) continue; // fixed along with an earlier one
    let fix: FixAction | null = { action } as FixAction;
    if (kind === 'duplicate') {
      const d = describeDuplicate(lib.db, r.subject.slice('hash:'.length));
      const clear = d && d.kind === 'duplicate' && d.keepId !== null && d.reason !== 'different-tags' && d.reason !== 'two-starred';
      fix = clear ? { action: 'keep-one', keepId: (d as { keepId: number }).keepId } : null;
    } else if (kind === 'loose_files') {
      fix = r.subject === 'root' ? null : { action: 'new-album', name: looseAlbumName(lib, r.subject) };
    } else if (kind === 'wrong_type' && r.subject.startsWith('file:') && action !== 'recycle') {
      fix = null;
    }
    if (!fix) {
      out.skipped++;
      continue;
    }
    try {
      await fixIssue(lib, r.id, fix);
      out.done++;
    } catch (err) {
      out.failed.push({ id: r.id, message: (err as Error).message });
    }
  }
  log('info', 'health', 'fix all', { kind, action, ...out, failed: out.failed.length });
  return out;
}

// ─── Missing folders and images ──────────────────────────────────────────────

/** Recreate a missing folder (and missing folders above it) with its marker; its images stay missing. */
function recreateFolder(lib: OpenLibrary, id: number): string {
  const { db } = lib;
  const f = db.prepare('SELECT id, uuid, kind, rel_path, missing_since FROM folders WHERE id = ?').get(id) as
    { id: number; uuid: string; kind: FolderKind; rel_path: string; missing_since: number | null } | undefined;
  if (!f) throw notFound('FOLDER_NOT_FOUND', 'This folder is no longer in the library.');
  const root = lib.moduleRoot('images');
  const parts = f.rel_path.split('/');
  const recreated: string[] = [];
  // Missing folders inside it come back with it, parents first.
  const inside = db.prepare("SELECT id, uuid, kind, rel_path FROM folders WHERE module = 'images' AND recycled = 0 AND missing_since IS NOT NULL AND rel_path LIKE ? || '/%' ORDER BY length(rel_path)")
    .all(f.rel_path) as { id: number; uuid: string; kind: FolderKind; rel_path: string }[];
  for (let i = 1; i <= parts.length; i++) {
    const rel = parts.slice(0, i).join('/');
    const row = db.prepare("SELECT id, uuid, kind, missing_since FROM folders WHERE module = 'images' AND rel_path = ? AND recycled = 0").get(rel) as
      { id: number; uuid: string; kind: FolderKind; missing_since: number | null } | undefined;
    const abs = toAbsolute(root, rel);
    if (fs.existsSync(abs) && (!row || row.missing_since === null)) continue;
    expectChange(abs);
    fs.mkdirSync(abs, { recursive: true });
    if (row) {
      writeMarker(abs, row.kind, lib.meta.id, row.uuid);
      db.prepare('UPDATE folders SET missing_since = NULL WHERE id = ?').run(row.id);
      clearIssue(db, 'missing_folder', `folder:${row.id}`);
    }
    recreated.push(rel);
  }
  for (const c of inside) {
    const abs = toAbsolute(root, c.rel_path);
    expectChange(abs);
    fs.mkdirSync(abs, { recursive: true });
    writeMarker(abs, c.kind, lib.meta.id, c.uuid);
    db.prepare('UPDATE folders SET missing_since = NULL WHERE id = ?').run(c.id);
    clearIssue(db, 'missing_folder', `folder:${c.id}`);
    recreated.push(c.rel_path);
  }
  return recreated.length > 1 ? `Recreated ${parts.at(-1)} · ${recreated.length} folders.` : `Recreated ${parts.at(-1)}.`;
}

/** Forget a missing folder: its rows and everything under it (tags, collection places go too). */
function forgetFolder(lib: OpenLibrary, id: number): string {
  const { db } = lib;
  const f = db.prepare('SELECT id, name, rel_path, missing_since FROM folders WHERE id = ?').get(id) as
    { id: number; name: string; rel_path: string; missing_since: number | null } | undefined;
  if (!f) throw notFound('FOLDER_NOT_FOUND', 'This folder is no longer in the library.');
  if (f.missing_since === null || fs.existsSync(toAbsolute(lib.moduleRoot('images'), f.rel_path))) {
    throw conflict('NOT_MISSING', 'This folder is back on disk — rescan instead of forgetting it.');
  }
  const like = `${f.rel_path}/%`;
  const n = db.transaction(() => {
    const fileIds = db.prepare("SELECT id FROM files WHERE rel_path LIKE ? AND recycled = 0").pluck().all(like) as number[];
    for (const fid of fileIds) clearIssue(db, 'missing_file', `file:${fid}`);
    db.prepare("DELETE FROM files WHERE rel_path LIKE ? AND recycled = 0").run(like);
    const folders = db.prepare("SELECT id FROM folders WHERE (rel_path LIKE ? OR id = ?) AND recycled = 0").pluck().all(like, f.id) as number[];
    for (const fid of folders) clearIssue(db, 'missing_folder', `folder:${fid}`);
    db.prepare('DELETE FROM folders WHERE id = ?').run(f.id); // sub-folders cascade
    return fileIds.length;
  })();
  return `Forgot ${f.name}${n ? ` and ${n} ${n === 1 ? 'image' : 'images'} in it` : ''}.`;
}

function forgetFile(lib: OpenLibrary, id: number): string {
  const f = fileBrief(lib.db, id);
  if (!f) throw notFound('FILE_NOT_FOUND', 'This image is no longer in the library.');
  lib.db.prepare('DELETE FROM files WHERE id = ?').run(id);
  return `Forgot ${f.filename}.`;
}

/**
 * Locate a missing image: the picked file must have the same content (hash). Inside the library it's
 * relinked where it is (replacing a record the scan made for it, if that one has nothing of its own);
 * outside, it's copied back into its old album (or the Inbox if that's gone).
 */
async function locateFile(lib: OpenLibrary, id: number, picked: string): Promise<string> {
  const { db } = lib;
  const f = db.prepare('SELECT id, filename, hash, folder_id FROM files WHERE id = ? AND missing_since IS NOT NULL').get(id) as
    { id: number; filename: string; hash: string | null; folder_id: number } | undefined;
  if (!f) throw notFound('FILE_NOT_FOUND', 'This image isn’t missing any more.');
  if (!f.hash) throw conflict('NO_HASH', 'The app never finished reading this image, so it can’t check that a file is the same one. Forget it, or add the file again.');
  if (!fs.existsSync(picked) || !fs.statSync(picked).isFile()) throw notFound('PICKED_NOT_FOUND', 'That file isn’t there.');
  if ((await hashFile(picked)) !== f.hash) throw conflict('NOT_THE_SAME', 'That’s a different image — its content doesn’t match. Nothing was changed.');

  const root = lib.moduleRoot('images');
  const rel = path.relative(root, picked);
  const inside = !rel.startsWith('..') && !path.isAbsolute(rel);
  let target: { rel: string; folderId: number };

  if (inside) {
    const dbRel = toDbPath(rel);
    if (!isImageFile(dbRel)) throw badRequest('NOT_AN_IMAGE', 'That isn’t an image file.');
    const dir = dbRel.includes('/') ? dbRel.slice(0, dbRel.lastIndexOf('/')) : '';
    const folder = db.prepare("SELECT id, kind FROM folders WHERE module = 'images' AND rel_path = ? AND recycled = 0 AND missing_since IS NULL").get(dir) as
      { id: number; kind: FolderKind } | undefined;
    if (!folder || (folder.kind !== 'album' && folder.kind !== 'inbox')) throw badRequest('NOT_IN_ALBUM', 'Images live in albums or the Inbox — move the file into one first.');
    const other = db.prepare("SELECT id, favorited FROM files WHERE media_type = 'image' AND rel_path = ? AND recycled = 0").get(dbRel) as { id: number; favorited: number } | undefined;
    if (other) {
      const own = (db.prepare('SELECT COUNT(*) FROM file_tags WHERE file_id = ?').pluck().get(other.id) as number) + listCount(db, other.id) + other.favorited;
      if (own > 0) throw conflict('IN_USE', 'That file is already another image in the library, with its own tags or places. Resolve it as a duplicate instead.');
      db.prepare('DELETE FROM files WHERE id = ?').run(other.id); // the scan's fresh record for the same file
    }
    target = { rel: dbRel, folderId: folder.id };
  } else {
    let album;
    try {
      album = liveFolder(lib, f.folder_id);
    } catch {
      album = null;
    }
    if (!album || (album.kind !== 'album' && album.kind !== 'inbox')) {
      album = liveFolder(lib, db.prepare("SELECT id FROM folders WHERE module = 'images' AND kind = 'inbox'").pluck().get() as number);
    }
    const { base, ext } = splitExt(f.filename);
    const name = uniqueName(toAbsolute(root, album.rel_path), base, ext);
    const dest = toAbsolute(root, `${album.rel_path}/${name}`);
    expectChange(dest);
    fs.copyFileSync(picked, dest);
    target = { rel: `${album.rel_path}/${name}`, folderId: album.id };
  }

  const stat = fs.statSync(toAbsolute(root, target.rel));
  db.prepare(
    'UPDATE files SET rel_path = ?, filename = ?, folder_id = ?, category_id = ?, size = ?, mtime = ?, missing_since = NULL WHERE id = ?',
  ).run(target.rel, path.posix.basename(target.rel), target.folderId, categoryIdOf(lib, target.rel), stat.size, Math.trunc(stat.mtimeMs), id);
  return inside ? `Found ${f.filename} — linked to ${target.rel}.` : `Found ${f.filename} — copied back into ${target.rel.slice(0, target.rel.lastIndexOf('/'))}.`;
}

// ─── Changes made outside the app ────────────────────────────────────────────

function undoExternalMove(lib: OpenLibrary, r: IssueRow, p: Record<string, unknown>): FixResult {
  const { db } = lib;
  if (p.entity === 'folder') {
    const f = liveFolder(lib, Number(p.folderId));
    const from = String(p.from);
    const parentRel = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
    const parent = parentRel
      ? db.prepare("SELECT * FROM folders WHERE module = 'images' AND rel_path = ? AND recycled = 0 AND missing_since IS NULL").get(parentRel) as Parameters<typeof relocate>[1] | undefined
      : null;
    if (parentRel && !parent) throw conflict('LOCATION_GONE', `Can’t move it back: ${parentRel.replaceAll('/', '\\')} no longer exists.`);
    assertCanHold(parent ?? null, f.kind);
    try {
      relocate(lib, f, from, parent?.id ?? null, kindAt(f.kind, parent ?? null));
    } catch (err) {
      throw conflict('LOCATION_TAKEN', `Can’t move it back: something named “${from.split('/').at(-1)}” is already there. (${(err as Error).message})`);
    }
    clearIssue(db, r.kind, r.subject);
    return { message: `Moved ${f.name} back to ${from.replaceAll('/', '\\')}.` };
  }

  const files = p.files as { id: number; from: string; to: string }[];
  const left: typeof files = [];
  let moved = 0;
  for (const x of files) {
    const dir = x.from.slice(0, x.from.lastIndexOf('/'));
    const folder = db.prepare("SELECT id, kind FROM folders WHERE module = 'images' AND rel_path = ? AND recycled = 0 AND missing_since IS NULL").get(dir) as
      { id: number; kind: FolderKind } | undefined;
    if (!folder || (folder.kind !== 'album' && folder.kind !== 'inbox')) {
      left.push(x);
      continue;
    }
    const res = moveFiles(lib, [x.id], folder.id, 'skip', new Map([[x.id, x.from.split('/').at(-1)!]]));
    if (res.done) moved++;
    else if (!res.skipped.some((s) => s.reason === 'Already there.')) left.push(x);
  }
  if (left.length === 0) clearIssue(db, r.kind, r.subject);
  else db.prepare('UPDATE health_issues SET payload = ? WHERE id = ?').run(JSON.stringify({ ...p, files: left }), r.id);
  if (moved === 0 && left.length) throw conflict('LOCATION_TAKEN', 'Can’t move them back: their old album is gone, or the names are taken there.');
  return { message: `Moved ${moved} ${moved === 1 ? 'image' : 'images'} back${left.length ? ` · ${left.length} couldn’t go back (old album gone or name taken)` : ''}.` };
}

/** The reappeared image is this record: it takes over the file, and the scan's new record goes. */
function pickCandidate(lib: OpenLibrary, newId: number, candidateId: number, candidates: { id: number }[]): string {
  const { db } = lib;
  if (!candidates.some((c) => c.id === candidateId)) throw badRequest('INVALID_CANDIDATE', 'That record isn’t one of the matches.');
  const fresh = db.prepare('SELECT * FROM files WHERE id = ? AND recycled = 0').get(newId) as Record<string, unknown> | undefined;
  const cand = fileBrief(db, candidateId);
  if (!fresh || !cand) throw notFound('FILE_NOT_FOUND', 'One of these images is no longer in the library.');
  db.transaction(() => {
    // Anything given to the new record meanwhile moves over: manual tags and collection places.
    db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id, source) SELECT ?, tag_id, 'manual' FROM file_tags WHERE file_id = ? AND source = 'manual'").run(candidateId, newId);
    db.prepare('UPDATE OR IGNORE collection_items SET file_id = ? WHERE file_id = ?').run(candidateId, newId);
    db.prepare('DELETE FROM files WHERE id = ?').run(newId);
    db.prepare(
      'UPDATE files SET rel_path = ?, filename = ?, ext = ?, folder_id = ?, category_id = ?, size = ?, mtime = ?, width = ?, height = ?, missing_since = NULL WHERE id = ?',
    ).run(fresh.rel_path, fresh.filename, fresh.ext, fresh.folder_id, fresh.category_id, fresh.size, fresh.mtime, fresh.width, fresh.height, candidateId);
    recomputeImplied(db, [candidateId]);
    clearIssue(db, 'missing_file', `file:${candidateId}`);
  })();
  return `${String(fresh.filename)} is ${cand.filename} again, with its tags.`;
}

// ─── Rule problems ───────────────────────────────────────────────────────────

/** Loose images (in a category, a sub-category or Images itself) go into a new or an existing album. */
function placeLoose(lib: OpenLibrary, subject: string, to: { name: string } | { albumId: number | null }): string {
  const { db } = lib;
  const root = lib.moduleRoot('images');
  if (subject === 'root') {
    // Not in the library yet: moved on disk, then the scan registers them where they land.
    if ('name' in to) throw badRequest('INVALID_PARENT', 'Albums can’t sit at the top level — pick an existing album or the Inbox.');
    const album = to.albumId === null
      ? liveFolder(lib, db.prepare("SELECT id FROM folders WHERE module = 'images' AND kind = 'inbox'").pluck().get() as number)
      : liveFolder(lib, to.albumId);
    if (album.kind !== 'album' && album.kind !== 'inbox') throw badRequest('NOT_AN_ALBUM', 'Images can only go into an album or the Inbox.');
    const dest = toAbsolute(root, album.rel_path);
    const names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isFile() && isImageFile(e.name)).map((e) => e.name);
    for (const n of names) {
      const { base, ext } = splitExt(n);
      const target = path.join(dest, uniqueName(dest, base, ext));
      expectChange(path.join(root, n), target);
      fs.renameSync(path.join(root, n), target);
    }
    requestScan(lib);
    return `Moved ${names.length} ${names.length === 1 ? 'image' : 'images'} into ${album.name}.`;
  }
  const folder = liveFolder(lib, Number(subject.slice('folder:'.length)));
  const ids = db.prepare("SELECT id FROM files WHERE folder_id = ? AND rel_path = ? || '/' || filename AND recycled = 0 AND missing_since IS NULL")
    .pluck().all(folder.id, folder.rel_path) as number[];
  let albumId: number | null;
  let albumName: string;
  if ('name' in to) {
    const card = createFolder(lib, { parentId: folder.id, kind: 'album', name: to.name });
    albumId = card.id;
    albumName = card.name;
  } else {
    albumId = to.albumId;
    albumName = albumId === null ? 'the Inbox' : liveFolder(lib, albumId).name;
  }
  const r = moveFiles(lib, ids, albumId, 'keep-both');
  return `Moved ${r.done} ${r.done === 1 ? 'image' : 'images'} into ${albumName}.`;
}

/** A folder inside an album goes up next to the album; the scan then registers it (to be confirmed). */
function moveOutOfAlbum(lib: OpenLibrary, relPath: string, albumId: number): string {
  const album = liveFolder(lib, albumId);
  const root = lib.moduleRoot('images');
  const parentRel = album.rel_path.slice(0, album.rel_path.lastIndexOf('/'));
  const from = toAbsolute(root, relPath);
  if (!fs.existsSync(from)) throw notFound('FOLDER_NOT_FOUND', 'That folder isn’t there any more.');
  const parentAbs = toAbsolute(root, parentRel);
  const name = uniqueName(parentAbs, path.basename(from), '');
  const to = path.join(parentAbs, name);
  expectChange(from, to);
  fs.renameSync(from, to);
  requestScan(lib);
  return `Moved ${path.basename(from)} out of ${album.name}${name !== path.basename(from) ? ` (as ${name})` : ''}.`;
}

/** The album becomes a sub-category: its images go into a new album inside it, next to the nested folder. */
function convertAlbum(lib: OpenLibrary, albumId: number, name: string): string {
  const { db } = lib;
  const album = liveFolder(lib, albumId);
  if (album.kind !== 'album') throw badRequest('NOT_AN_ALBUM', 'Only an album can be converted.');
  const root = lib.moduleRoot('images');
  db.prepare("UPDATE folders SET kind = 'subcategory', updated_at = ? WHERE id = ?").run(Date.now(), album.id);
  writeMarker(toAbsolute(root, album.rel_path), 'subcategory', lib.meta.id, album.uuid);
  const ids = db.prepare('SELECT id FROM files WHERE folder_id = ? AND recycled = 0 AND missing_since IS NULL').pluck().all(album.id) as number[];
  const inner = createFolder(lib, { parentId: album.id, kind: 'album', name });
  const r = moveFiles(lib, ids, inner.id, 'keep-both');
  requestScan(lib);
  return `${album.name} is now a sub-category; its ${r.done} ${r.done === 1 ? 'image is' : 'images are'} in ${inner.name}.`;
}

/** Confirm (or change) the kind the scan guessed for a new folder. */
function confirmKind(lib: OpenLibrary, folderId: number, wanted?: FolderKind): string {
  const { db } = lib;
  const f = liveFolder(lib, folderId);
  const parent = f.parent_id === null ? null : liveFolder(lib, f.parent_id);
  const kind = wanted ?? f.kind;
  if (kind === 'inbox') throw badRequest('INVALID_KIND', 'There is only one Inbox.');
  if (!parent && kind !== 'category') throw badRequest('INVALID_KIND', 'A top-level folder is always a category.');
  if (parent && kind === 'category') throw badRequest('INVALID_KIND', 'A category inside a folder is a sub-category.');
  if (kind !== f.kind) {
    db.prepare('UPDATE folders SET kind = ?, updated_at = ? WHERE id = ?').run(kind, Date.now(), f.id);
    writeMarker(toAbsolute(lib.moduleRoot('images'), f.rel_path), kind, lib.meta.id, f.uuid);
    requestScan(lib); // the rules (loose images, nested folders) follow the new kind
  }
  const label = kind === 'subcategory' ? 'a sub-category' : kind === 'album' ? 'an album' : 'a category';
  return kind === f.kind ? `${f.name} stays ${label}.` : `${f.name} is now ${label}.`;
}

// ─── Wrong file types ────────────────────────────────────────────────────────

/** Count a file in the per-format statistics (Ignore, Record), and log it. */
function countFormat(db: DB, ext: string, what: 'ignored' | 'recorded', relPath: string): void {
  const e = ext.toLowerCase();
  db.prepare(`INSERT INTO format_stats (ext, ${what}) VALUES (?, 1) ON CONFLICT (ext) DO UPDATE SET ${what} = ${what} + 1`).run(e);
  log('info', 'formats', what === 'ignored' ? 'file ignored' : 'file recorded', { ext: e, path: relPath });
}

/** Ignore: the file stays where it is, the scan stops reporting it, and it's listed as Not tracked. */
function ignoreFile(lib: OpenLibrary, relPath: string, reason: 'unsupported' | 'wrong_type'): string {
  const ext = relPath.includes('.') ? relPath.slice(relPath.lastIndexOf('.') + 1).toLowerCase() : '';
  if (!fs.existsSync(toAbsolute(lib.moduleRoot('images'), relPath))) throw notFound('FILE_NOT_FOUND', 'This file is no longer there.');
  lib.db.prepare('INSERT OR REPLACE INTO untracked_files (rel_path, ext, reason, ignored_at) VALUES (?, ?, ?, ?)').run(relPath, ext, reason, Date.now());
  countFormat(lib.db, ext, 'ignored', relPath);
  return `Ignored ${relPath.split('/').at(-1)} — it stays where it is, listed under Not tracked.`;
}

/** Record: the file goes to the hidden Invalid folder (same path inside it), counted per format. */
function recordFile(lib: OpenLibrary, relPath: string): string {
  const from = toAbsolute(lib.moduleRoot('images'), relPath);
  if (!fs.existsSync(from)) throw notFound('FILE_NOT_FOUND', 'This file is no longer there.');
  const invalid = path.join(lib.root, DATA_DIR, 'Invalid');
  const destDir = path.dirname(toAbsolute(invalid, relPath));
  fs.mkdirSync(destDir, { recursive: true });
  const { base, ext } = splitExt(path.basename(from));
  const to = path.join(destDir, uniqueName(destDir, base, ext));
  expectChange(from, to);
  fs.renameSync(from, to);
  lib.db.prepare('DELETE FROM untracked_files WHERE rel_path = ?').run(relPath);
  countFormat(lib.db, ext.replace(/^\./, ''), 'recorded', relPath);
  return `Recorded ${path.basename(from)} — moved to the library's hidden Invalid folder.`;
}

/** Not tracked → back to being reported (Track again), or moved to the Invalid folder (Record). */
export function untrackedAction(lib: OpenLibrary, paths: string[], action: 'track' | 'record'): { changed: number; failed: { path: string; message: string }[] } {
  const { db } = lib;
  const out = { changed: 0, failed: [] as { path: string; message: string }[] };
  for (const relPath of paths) {
    const row = db.prepare('SELECT rel_path, ext, reason FROM untracked_files WHERE rel_path = ?').get(relPath) as { rel_path: string; ext: string; reason: 'unsupported' | 'wrong_type' } | undefined;
    if (!row) continue;
    try {
      if (action === 'track') {
        db.prepare('DELETE FROM untracked_files WHERE rel_path = ?').run(relPath);
        raiseIssue(db, row.reason, `path:${row.rel_path}`, { path: row.rel_path, ext: row.ext });
      } else recordFile(lib, row.rel_path);
      out.changed++;
    } catch (err) {
      out.failed.push({ path: relPath, message: (err as Error).message });
    }
  }
  log('info', 'health', action === 'track' ? 'tracked again' : 'recorded from Not tracked', { files: out.changed });
  changed();
  return out;
}

function recycleWrongType(lib: OpenLibrary, subject: string, p: Record<string, unknown>): string {
  if (subject.startsWith('file:')) {
    const r = recycleFiles(lib, [Number(p.fileId)]);
    if (r.starred.length) throw conflict('STARRED', 'This image is starred — unstar it first.');
    if (!r.recycled) throw notFound('FILE_NOT_FOUND', 'This image is no longer in the library.');
  } else {
    recycleStray(lib, String(p.path));
  }
  return `Sent ${String(p.path).split('/').at(-1)} to the Recycle Bin.`;
}

// ─── Duplicates ──────────────────────────────────────────────────────────────

/**
 * Keep one copy and recycle the others; with `merge`, the kept copy first gets every tag, the star,
 * a description and every collection place of the others (technical doc §7.4).
 */
function resolveDuplicate(lib: OpenLibrary, hash: string, keepId: number, merge: boolean): string {
  const { db } = lib;
  const d = describeDuplicate(db, hash);
  if (!d || d.kind !== 'duplicate') throw notFound('NOT_DUPLICATE', 'These images aren’t duplicates any more.');
  const keep = d.copies.find((c) => c.id === keepId);
  if (!keep) throw badRequest('INVALID_COPY', 'That image isn’t one of the copies.');
  const others = d.copies.filter((c) => c.id !== keepId);

  if (!merge) {
    if (others.some((c) => c.favorited)) throw conflict('STARRED', 'Another copy is starred — keep that one, merge, or unstar it first.');
  } else {
    db.transaction(() => {
      const addTag = db.prepare("INSERT INTO file_tags (file_id, tag_id, source) VALUES (?, ?, 'manual') ON CONFLICT (file_id, tag_id) DO UPDATE SET source = 'manual'");
      for (const c of others) for (const t of c.tags) addTag.run(keepId, t.id);
      recomputeImplied(db, [keepId]);
      if (others.some((c) => c.favorited)) {
        db.prepare('UPDATE files SET favorited = 1 WHERE id = ?').run(keepId);
        for (const c of others) db.prepare('UPDATE files SET favorited = 0 WHERE id = ?').run(c.id);
      }
      if (!keep.description?.trim()) {
        const text = others.find((c) => c.description?.trim())?.description;
        if (text) db.prepare('UPDATE files SET description = ? WHERE id = ?').run(text, keepId);
      }
      const posOf = db.prepare('SELECT position FROM collection_items WHERE collection_id = ? AND file_id = ?').pluck();
      for (const c of others) {
        for (const list of c.collections) {
          const mine = posOf.get(list.id, keepId) as number | undefined;
          const theirs = posOf.get(list.id, c.id) as number;
          if (mine === undefined) db.prepare('UPDATE collection_items SET file_id = ? WHERE collection_id = ? AND file_id = ?').run(keepId, list.id, c.id);
          else {
            // On the same list twice: the kept copy takes the earlier place.
            if (theirs < mine) db.prepare('UPDATE collection_items SET position = ? WHERE collection_id = ? AND file_id = ?').run(theirs, list.id, keepId);
            db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND file_id = ?').run(list.id, c.id);
            renumber(db, list.id);
          }
        }
        db.prepare('UPDATE collections SET cover_file_id = ? WHERE cover_file_id = ?').run(keepId, c.id);
        db.prepare('UPDATE tags SET cover_file_id = ? WHERE cover_file_id = ?').run(keepId, c.id);
      }
    })();
  }
  const r = recycleFiles(lib, others.map((c) => c.id));
  const where = keep.path.slice(0, keep.path.lastIndexOf('/')).replaceAll('/', '\\');
  return `${merge ? 'Merged into' : 'Kept'} the copy in ${where} · ${r.recycled} sent to the Recycle Bin.`;
}
