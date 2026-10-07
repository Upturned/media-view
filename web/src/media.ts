import type { FileItem, SortKey, ThumbRef } from '@media-view/shared';

/** URLs and query strings shared by grids, cards and the viewer. */

export const thumbUrl = (f: ThumbRef) => `/media/thumb/${f.id}?v=${encodeURIComponent(f.v)}`;
export const fileUrl = (f: ThumbRef) => `/media/file/${f.id}?v=${encodeURIComponent(f.v)}`;

/** The filters of a list of images: the grid uses them, and the viewer gets them to step through the same list. */
export interface ListQuery {
  folder?: number;
  recursive?: boolean;
  favorites?: boolean;
  name?: string;
  /** A search in the search syntax. */
  q?: string;
  /** Images with this tag (tag galleries). */
  tag?: number;
  /** Images on this collection (collection pages); allows the `position` sort. */
  collection?: number;
  sort: SortKey;
  order: 'asc' | 'desc';
  seed?: number;
}

export function toParams(q: ListQuery): Record<string, string> {
  const p: Record<string, string> = { sort: q.sort, order: q.order };
  if (q.folder !== undefined) p.folder = String(q.folder);
  if (q.recursive) p.recursive = '1';
  if (q.favorites) p.favorites = '1';
  if (q.name?.trim()) p.name = q.name.trim();
  if (q.q?.trim()) p.q = q.q.trim();
  if (q.tag !== undefined) p.tag = String(q.tag);
  if (q.collection !== undefined) p.collection = String(q.collection);
  if (q.seed !== undefined) p.seed = String(q.seed);
  return p;
}

export function fromParams(p: URLSearchParams): ListQuery {
  const num = (k: string) => (p.has(k) ? Number(p.get(k)) : undefined);
  const sort = p.get('sort') as SortKey | null;
  return {
    folder: num('folder'),
    recursive: p.get('recursive') === '1',
    favorites: p.get('favorites') === '1',
    name: p.get('name') ?? undefined,
    q: p.get('q') ?? undefined,
    tag: num('tag'),
    collection: num('collection'),
    sort: sort && ['name', 'modified', 'added', 'size', 'random', 'position'].includes(sort) ? sort : 'name',
    order: p.get('order') === 'desc' ? 'desc' : 'asc',
    seed: num('seed'),
  };
}

/** Viewer route for a file opened from a list. */
export function viewerHref(fileId: number, q: ListQuery): string {
  return `#/images/v/${fileId}?${new URLSearchParams(toParams(q))}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fmt = (n: number) => n.toLocaleString('en-US');

export const isGif = (f: Pick<FileItem, 'ext'>) => f.ext === 'gif';
