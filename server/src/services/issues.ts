import type { DB } from '../db/connection.ts';

/** Library Health issues (technical doc §7.4). The UI for them arrives in milestone 7. */

export type IssueKind =
  | 'missing_folder' | 'missing_file' | 'external_move' | 'ambiguous_move' | 'loose_files'
  | 'nested_in_album' | 'unmarked_folder' | 'wrong_type' | 'duplicate' | 'orphan_thumbs';

const SEVERITY: Record<IssueKind, 'error' | 'warning' | 'info'> = {
  missing_folder: 'error',
  missing_file: 'error',
  external_move: 'warning',
  ambiguous_move: 'warning',
  loose_files: 'warning',
  nested_in_album: 'warning',
  unmarked_folder: 'warning',
  wrong_type: 'warning',
  duplicate: 'info',
  orphan_thumbs: 'info',
};

/** Insert or update an issue, keeping its original detection time. */
export function raiseIssue(db: DB, kind: IssueKind, subject: string, payload: object): void {
  db.prepare(
    `INSERT INTO health_issues (kind, severity, subject, payload, detected_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (kind, subject) DO UPDATE SET payload = excluded.payload, severity = excluded.severity`,
  ).run(kind, SEVERITY[kind], subject, JSON.stringify(payload), Date.now());
}

export function getIssuePayload<T>(db: DB, kind: IssueKind, subject: string): T | null {
  const raw = db.prepare('SELECT payload FROM health_issues WHERE kind = ? AND subject = ?').pluck().get(kind, subject) as string | undefined;
  return raw ? (JSON.parse(raw) as T) : null;
}

export function clearIssue(db: DB, kind: IssueKind, subject: string): void {
  db.prepare('DELETE FROM health_issues WHERE kind = ? AND subject = ?').run(kind, subject);
}

/**
 * For "state" issues that a full scan recomputes from scratch: remembers which ones were raised
 * during this run, so the ones that no longer apply can be removed at the end.
 */
export class IssueSweep {
  private readonly seen = new Set<string>();

  constructor(
    private readonly db: DB,
    private readonly kinds: IssueKind[],
    /** Issues of these kinds that the sweep must leave alone (raised by someone else). */
    private readonly keep: (kind: string, subject: string) => boolean = () => false,
  ) {}

  raise(kind: IssueKind, subject: string, payload: object): void {
    this.seen.add(`${kind}\u0000${subject}`);
    raiseIssue(this.db, kind, subject, payload);
  }

  /** Delete issues of the swept kinds that weren't raised again. */
  finish(): void {
    const rows = this.db.prepare(
      `SELECT id, kind, subject FROM health_issues WHERE kind IN (${this.kinds.map(() => '?').join(',')})`,
    ).all(...this.kinds) as { id: number; kind: string; subject: string }[];
    const del = this.db.prepare('DELETE FROM health_issues WHERE id = ?');
    for (const r of rows) {
      if (!this.seen.has(`${r.kind}\u0000${r.subject}`) && !this.keep(r.kind, r.subject)) del.run(r.id);
    }
  }
}

/** Recompute `duplicate` issues: identical content (same hash) present more than once. */
export function refreshDuplicates(db: DB): void {
  const groups = db.prepare(
    `SELECT hash, group_concat(id) AS ids FROM files
     WHERE hash IS NOT NULL AND recycled = 0 AND missing_since IS NULL
     GROUP BY hash HAVING COUNT(*) > 1`,
  ).all() as { hash: string; ids: string }[];
  db.transaction(() => {
    const sweep = new IssueSweep(db, ['duplicate']);
    for (const g of groups) sweep.raise('duplicate', `hash:${g.hash}`, { fileIds: g.ids.split(',').map(Number) });
    sweep.finish();
  })();
}
