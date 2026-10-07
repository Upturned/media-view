import type { FixAction, HealthIssue, HealthReport, IssueKind } from '@media-view/shared';
import { fmt, formatSize } from './media.ts';

/**
 * The groups of the Library Health page (design M7 · 01): which issue kinds each holds, how the
 * overview sums it up, and its group fix ("Recreate 2", "Keep all 4") — always asked first.
 */

export type Section = 'red' | 'amber' | 'blue' | 'white';

export const SECTIONS: Record<Section, { title: string; sub: string; color: string }> = {
  red: { title: 'Red — missing', sub: 'folders or images the app can’t find', color: 'var(--red)' },
  amber: { title: 'Amber — needs a decision', sub: 'rule problems, unmarked folders, changes made outside the app, file types', color: 'var(--amber)' },
  blue: { title: 'Blue — for your information', sub: 'not counted in the badge', color: 'var(--blue)' },
  white: { title: 'White — notices', sub: 'not problems · never on the badge', color: 'var(--text)' },
};

export interface GroupFix {
  label: string;
  /** For the confirmation: what it will do, in general terms. */
  does: string;
  steps: { kind: IssueKind; action: FixAction['action'] }[];
}

export interface Group {
  key: string;
  section: Section;
  title: string;
  kinds: IssueKind[];
  /** No default fix: each item needs a choice. */
  need?: boolean;
  /** Review hint, at the right of the group header. */
  hint: string;
  issues: HealthIssue[];
  count: string;
  sample: string;
  fix: GroupFix | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const last = (p: string) => p.split('/').filter(Boolean).at(-1) ?? 'Images';
const list = (xs: string[], max = 3) => xs.slice(0, max).join(' · ') + (xs.length > max ? ` · +${xs.length - max}` : '');

/** The groups with something in them, from a report. */
export function groupsOf(r: HealthReport): Group[] {
  const of = (...kinds: IssueKind[]) => r.issues.filter((i) => kinds.includes(i.kind));
  const out: Group[] = [];
  const add = (g: Omit<Group, 'count'> & { count?: string }) => {
    if (g.issues.length === 0 && g.count === undefined) return;
    out.push({ ...g, count: g.count ?? fmt(g.issues.length) });
  };

  const folders = of('missing_folder');
  add({
    key: 'missing-folders', section: 'red', title: 'Missing folders', kinds: ['missing_folder'], issues: folders,
    hint: 'recreate brings back the folder and its marker',
    sample: list(folders.map((i) => i.details.kind === 'missing_folder' ? `${i.details.name} · ${i.details.folderKind === 'subcategory' ? 'sub-category' : i.details.folderKind}, ${plural(i.details.images, 'image')}` : '')),
    fix: folders.length ? { label: `Recreate ${folders.length}`, does: `Recreate ${plural(folders.length, 'missing folder')} and their markers (their images stay missing)`, steps: [{ kind: 'missing_folder', action: 'recreate' }] } : null,
  });
  const images = of('missing_file');
  add({
    key: 'missing-images', section: 'red', title: 'Missing images', kinds: ['missing_file'], issues: images, need: true,
    hint: 'shown with the tags they had', sample: list(images.map((i) => (i.details.kind === 'missing_file' ? i.details.filename : ''))), fix: null,
  });

  const changes = of('external_move');
  add({
    key: 'changed', section: 'amber', title: 'Changed outside the app', kinds: ['external_move'], issues: changes,
    hint: 'images moved together are one item',
    sample: list(changes.map((i) => i.details.kind === 'external_move'
      ? i.details.entity === 'folder' ? `${last(i.details.from)} → ${last(i.details.to)}` : plural(i.details.files.length, 'image') + ' moved'
      : '')),
    fix: changes.length ? { label: `Keep all ${changes.length}`, does: `Keep ${plural(changes.length, 'change')} made outside the app (nothing moves)`, steps: [{ kind: 'external_move', action: 'keep' }] } : null,
  });
  const unclear = of('ambiguous_move');
  add({
    key: 'unclear', section: 'amber', title: 'Unclear moves', kinds: ['ambiguous_move'], issues: unclear, need: true, hint: 'one image, several histories',
    sample: list(unclear.map((i) => (i.details.kind === 'ambiguous_move' ? `${last(i.details.file.path)} matches ${plural(i.details.candidates.length, 'missing image')}` : ''))), fix: null,
  });
  const rules = of('loose_files', 'nested_in_album');
  const loose = rules.filter((i) => i.details.kind === 'loose_files' && i.details.folderId !== null);
  const nested = rules.filter((i) => i.kind === 'nested_in_album');
  const looseImages = rules.reduce((n, i) => n + (i.details.kind === 'loose_files' ? i.details.count : 0), 0);
  add({
    key: 'rules', section: 'amber', title: 'Rule problems', kinds: ['loose_files', 'nested_in_album'], issues: rules, hint: 'loose images · folders inside albums',
    sample: [looseImages && `${plural(looseImages, 'loose image')} in ${plural(rules.length - nested.length, 'folder')}`, nested.length && `${plural(nested.length, 'folder')} inside an album`].filter(Boolean).join(' · '),
    fix: loose.length + nested.length ? {
      label: `Fix all ${loose.length + nested.length}`,
      does: [loose.length && `Put loose images into ${plural(loose.length, 'new album')} (“Loose images”)`, nested.length && `move ${plural(nested.length, 'folder')} out of albums`].filter(Boolean).join(' · '),
      steps: [...(loose.length ? [{ kind: 'loose_files' as const, action: 'new-album' as const }] : []), ...(nested.length ? [{ kind: 'nested_in_album' as const, action: 'move-out' as const }] : [])],
    } : null,
  });
  const unmarked = of('unmarked_folder');
  add({
    key: 'unmarked', section: 'amber', title: 'Unmarked folders', kinds: ['unmarked_folder'], issues: unmarked, hint: 'made outside the app · kind guessed',
    sample: unmarked.length ? `${list(unmarked.map((i) => (i.details.kind === 'unmarked_folder' ? last(i.details.path) : '')))} — kinds guessed` : '',
    fix: unmarked.length ? { label: `Confirm ${unmarked.length}`, does: `Confirm ${plural(unmarked.length, 'guessed folder kind')} and write their markers`, steps: [{ kind: 'unmarked_folder', action: 'confirm' }] } : null,
  });
  const unsupported = of('unsupported');
  const byExt = new Map<string, number>();
  for (const i of unsupported) if (i.details.kind === 'unsupported') byExt.set(i.details.ext.toUpperCase(), (byExt.get(i.details.ext.toUpperCase()) ?? 0) + 1);
  add({
    key: 'unsupported', section: 'amber', title: 'Not supported', kinds: ['unsupported'], issues: unsupported, need: true, hint: 'image formats the app can’t show yet',
    sample: [...byExt].map(([e, n]) => `${n} ${e}`).join(' · '), fix: null,
  });
  const wrong = of('wrong_type');
  add({
    key: 'wrong', section: 'amber', title: 'Wrong file types', kinds: ['wrong_type'], issues: wrong, need: true, hint: 'files no module takes',
    sample: list(wrong.map((i) => (i.details.kind === 'wrong_type' ? last(i.details.path) : ''))), fix: null,
  });

  if (r.summary.untagged) {
    add({
      key: 'untagged', section: 'blue', title: 'Untagged images', kinds: [], issues: [], count: plural(r.summary.untagged, 'image'), hint: 'outside the Inbox · no tags yet',
      sample: `in ${plural(r.untaggedAlbums.length, 'album')}${r.summary.fresh ? ` · ${fmt(r.summary.fresh)} NEW from outside the app` : ''}`, fix: null,
    });
  }
  const dups = of('duplicate');
  const clear = dups.filter((i) => i.details.kind === 'duplicate' && i.details.keepId !== null && i.details.reason !== 'different-tags' && i.details.reason !== 'two-starred');
  add({
    key: 'duplicates', section: 'blue', title: 'Duplicates', kinds: ['duplicate'], issues: dups, count: plural(dups.length, 'group'), hint: 'click a copy to keep it · keep one or merge',
    need: clear.length === 0,
    sample: [clear.length && `${fmt(clear.length)} with a suggested copy`, dups.length - clear.length && `${fmt(dups.length - clear.length)} need your choice`].filter(Boolean).join(' · '),
    fix: clear.length ? { label: `Keep suggested (${clear.length})`, does: `Keep the suggested copy in ${plural(clear.length, 'group')} and send the other copies to the Recycle Bin`, steps: [{ kind: 'duplicate', action: 'keep-one' }] } : null,
  });
  if (r.thumbnails.count) {
    add({
      key: 'thumbnails', section: 'blue', title: 'Thumbnail cleanup', kinds: [], issues: [], count: plural(r.thumbnails.count, 'thumbnail'), hint: 'cached thumbnails no image uses',
      sample: `${formatSize(r.thumbnails.bytes)} of cached thumbnails that belong to no image`, fix: null,
    });
  }

  const moved = of('moved_file');
  add({
    key: 'moved', section: 'white', title: 'Moved automatically', kinds: ['moved_file'], issues: moved, hint: 'videos, audio and texts went to their own folders',
    sample: list(moved.map((i) => (i.details.kind === 'moved_file' ? `${last(i.details.from)} → ${i.details.to.split('/')[0]}` : ''))),
    fix: moved.length ? { label: `OK all ${moved.length}`, does: `Dismiss ${plural(moved.length, 'notice')}`, steps: [{ kind: 'moved_file', action: 'ok' }] } : null,
  });
  if (r.untracked.length) {
    add({
      key: 'untracked', section: 'white', title: 'Not tracked', kinds: [], issues: [], count: plural(r.untracked.length, 'file'), hint: 'files you chose to ignore · they stay where they are',
      sample: list(r.untracked.map((u) => last(u.path))), fix: null,
    });
  }
  return out;
}

/** Where a group's Review ▸ goes. */
export const reviewHref = (g: Group) => (g.key === 'untagged' ? '/health/untagged' : `/health/review/${g.section}?group=${g.key}`);
