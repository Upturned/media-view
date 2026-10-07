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

/** `position` is a collection's own order (only with a collection scope). */
export type SortKey = 'name' | 'modified' | 'added' | 'size' | 'random' | 'position';

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
  /** In a collection's list (or a "Group by collection" section): the 1-based place in its own order. */
  position?: number | null;
  /** In a collection's list: the album it lives in, as a path (`Fantasy › Elves › Portraits`). */
  where?: string;
}

export interface FileDetail extends FileItem {
  relPath: string;
  tags: FileTag[];
  folder: Crumb;
  /** Ancestors of the file's folder, top-level first. */
  ancestors: Crumb[];
  description: string | null;
  /** The collections the image is on, by name. */
  collections: FileCollection[];
}

/** A collection an image is on (the viewer's Collections panel). */
export interface FileCollection extends CollectionRef {
  /** 1-based place of the image in the list (live images only), and the list's size. */
  position: number;
  total: number;
  cover: ThumbRef | null;
  updatedAt: number;
}

// ─── Tags (milestone 4) ─────────────────────────────────────────────────────

export interface TagTypeInfo {
  id: number;
  /** Used in searches as `key:name`. */
  key: string;
  name: string;
  color: string;
  position: number;
  isDefault: boolean;
  tagCount: number;
}

export interface TagRef {
  id: number;
  typeId: number;
  name: string;
}

export interface TagSummary extends TagRef {
  /** Images carrying the tag (manually or implied). */
  count: number;
  aliases: string[];
}

export interface TagDetail extends TagSummary {
  description: string | null;
  cover: ThumbRef | null;
  createdAt: number;
  implies: TagRef[];
  impliedBy: TagRef[];
}

export interface TagSuggestion extends TagRef {
  count: number;
  /** The alias that matched, when it was an alias. */
  alias: string | null;
}

/** A tag on an image. Implied tags come from another tag and can't be removed on their own. */
export interface FileTag extends TagRef {
  source: 'manual' | 'implied';
}

/** For the bulk tag dialog: how many of the selected images carry each tag. */
export interface TagCoverage extends TagRef {
  count: number;
  /** On every image that has it, it's only implied. */
  impliedOnly: boolean;
}

// ─── Wiki and custom fields (milestone 5) ───────────────────────────────────

export type FieldKind = 'text' | 'longtext' | 'number' | 'date' | 'link' | 'choice' | 'image' | 'tagref';

export interface FieldOptions {
  /** choice */
  choices?: string[];
  /** number: shown after the value ("years") */
  unit?: string;
  /** tagref: allowed tag type ids (empty = any) */
  types?: number[];
  /** tagref: several, in a chosen order */
  multi?: boolean;
}

export interface FieldDef {
  id: number;
  typeId: number;
  key: string;
  label: string;
  kind: FieldKind;
  position: number;
  options: FieldOptions;
  /** Tags of the type with a value in this field. */
  filled: number;
}

/** A field's value on a tag: `value` for text-like kinds, `file` for images, `tags` for tag references. */
export interface FieldValue {
  fieldId: number;
  value: string | null;
  file: (ThumbRef & { filename: string }) | null;
  tags: TagRef[];
}

/** What a page save sends per field (only the part matching the kind is used). */
export interface FieldInput {
  value?: string | null;
  fileId?: number | null;
  tagIds?: number[];
}

export interface RelatedTag extends TagRef {
  /** Images carrying both tags. */
  together: number;
  /** Share of this tag's images that also carry the related one (0–100). */
  pct: number;
}

export interface WikiPage extends TagDetail {
  updatedAt: number;
  fields: FieldDef[];
  values: FieldValue[];
  related: RelatedTag[];
  /** Newest images with the tag. */
  preview: ThumbRef[];
}

// ─── Collections (milestone 6) ──────────────────────────────────────────────

export interface CollectionRef {
  id: number;
  name: string;
}

/** A collection shown as a card (Collections page, Search, wiki). */
export interface CollectionCard extends CollectionRef {
  description: string | null;
  /** Live images on the list. */
  count: number;
  /** The cover (the chosen one, else the first image), then the next images in the list's order: up to 5. */
  covers: ThumbRef[];
  updatedAt: number;
  /** When images were last added (the Add dialog's "recent"), or null. */
  lastAddedAt: number | null;
  /** With a tag filter: how many of the list's images carry the tag. */
  tagged?: number;
}

export interface CollectionDetail extends CollectionCard {
  /** The chosen cover, or null when it's the first image. */
  coverFileId: number | null;
  createdAt: number;
  /** Where the list's images live (albums and the Inbox), most first. */
  albums: { id: number; name: string; path: string; count: number }[];
}

/** What deleting a collection returns, so it can be undone. */
export interface CollectionSnapshot {
  id: number;
  name: string;
  description: string | null;
  coverFileId: number | null;
  createdAt: number;
  fileIds: number[];
}

/** A grid row with "Group by collection": an image in two collections comes once per section. */
export interface GroupedFileItem extends FileItem {
  /** The section, or null for "Not in a collection". */
  group: CollectionRef | null;
  /** How many collections the image is on (2+ shows "2×"). */
  listed: number;
}

/** How many of a list's images each collection holds (the index's Collections section, group headers). */
export interface CollectionCount extends CollectionRef {
  count: number;
  /** All live images on the list. */
  size: number;
}
