export type Module = 'images' | 'videos' | 'audio' | 'texts';
export type FolderKind = 'category' | 'subcategory' | 'album' | 'inbox';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'jfif', 'png', 'gif', 'webp', 'svg', 'avif'] as const;

export function isImageFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return name.includes('.') && (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface LibraryInfo {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  stats: { folders: number; categories: number; files: number; inboxFiles: number };
  scan: ScanStatus;
}

export interface ScanStatus {
  status: 'idle' | 'scanning';
  /** Unix ms of the last completed scan. */
  lastScan: number | null;
  /** Files still waiting to be hashed. */
  hashing: number;
}

export interface AboutInfo {
  name: string;
  version: string;
  releaseDate: string;
  credits: string;
  formats: Record<Module, readonly string[]>;
}

/** A folder shown as a card. */
export interface FolderCard {
  id: number;
  kind: FolderKind;
  name: string;
  description: string | null;
  /** Images in this folder and everything under it. */
  imageCount: number;
  subcategoryCount: number;
  albumCount: number;
  /** Up to 3 cover candidates: the chosen cover first, then the first images under the folder. */
  covers: ThumbRef[];
}

export interface ThumbRef {
  id: number;
  /** Cache key for media URLs (changes when the file changes). */
  v: string;
}

export interface Crumb {
  id: number;
  kind: FolderKind;
  name: string;
}

export interface FolderDetail extends FolderCard {
  relPath: string;
  parentId: number | null;
  /** From the top-level folder down to the parent (the folder itself excluded). */
  ancestors: Crumb[];
}

export interface InboxSummary extends FolderCard {
  newThisWeek: number;
  /** Unix ms of the oldest image waiting, or null when empty. */
  oldestAddedAt: number | null;
}

export type SortKey = 'name' | 'modified' | 'added' | 'size' | 'random';

export interface FileItem {
  id: number;
  folderId: number;
  filename: string;
  ext: string;
  size: number;
  mtime: number;
  addedAt: number;
  favorited: boolean;
  width: number | null;
  height: number | null;
  v: string;
}

export interface FileDetail extends FileItem {
  relPath: string;
  folder: Crumb;
  /** Ancestors of the file's folder, top-level first. */
  ancestors: Crumb[];
  description: string | null;
}
