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
  /** Found on disk by a scan (not imported through the app) and not marked as seen yet. */
  isNew?: boolean;
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

// ─── Library Health (milestone 7) ───────────────────────────────────────────

/** Red, amber, blue — and white notices, which aren't problems and never count on the badge. */
export type HealthSeverity = 'error' | 'warning' | 'info' | 'notice';

export type IssueKind =
  | 'missing_folder' | 'missing_file' | 'external_move' | 'ambiguous_move' | 'loose_files'
  | 'nested_in_album' | 'unmarked_folder' | 'wrong_type' | 'unsupported' | 'moved_file' | 'duplicate' | 'orphan_thumbs';

/** Counts for the top-bar badge (red + amber make the number; blue only shows a dot). */
export interface HealthSummary {
  error: number;
  warning: number;
  /** Stored info issues (duplicates…), without the untagged images. */
  info: number;
  /** White notices (never on the badge). */
  notice: number;
  /** Untagged images outside the Inbox, and how many of them are NEW. */
  untagged: number;
  fresh: number;
}

/** A copy in a group of identical images. */
export interface DuplicateCopy {
  id: number;
  path: string;
  folderId: number;
  /** Manual tags (implied ones follow them). */
  tags: TagRef[];
  favorited: boolean;
  collections: CollectionRef[];
  description: string | null;
  addedAt: number;
}

/** Why a copy is suggested — or why there's no default and the user must choose. */
export type DuplicateReason = 'only-tagged' | 'oldest' | 'starred' | 'different-tags' | 'two-starred';

export type IssueDetails =
  /** One item for the folder and everything in it: `folders` missing folders inside, `images` images. */
  | { kind: 'missing_folder'; folderId: number; path: string; folderKind: FolderKind; name: string; images: number; folders: number }
  | { kind: 'missing_file'; fileId: number; path: string; filename: string; thumb: ThumbRef | null; tags: TagRef[]; favorited: boolean; collections: number }
  | { kind: 'external_move'; entity: 'folder'; folderId: number; name: string; from: string; to: string }
  | {
    kind: 'external_move';
    entity: 'files';
    fromFolder: string;
    toFolder: string;
    files: { id: number; filename: string; from: string; to: string; thumb: ThumbRef | null }[];
  }
  | {
    kind: 'ambiguous_move';
    file: { id: number; path: string; thumb: ThumbRef | null };
    candidates: { id: number; path: string; tags: TagRef[]; favorited: boolean; collections: number; description: string | null }[];
  }
  | { kind: 'loose_files'; folderId: number | null; path: string; count: number; paths: string[] }
  | { kind: 'nested_in_album'; path: string; albumId: number; albumPath: string; moveOutTo: string }
  | { kind: 'unmarked_folder'; folderId: number; path: string; current: FolderKind; inferred: FolderKind; certain: boolean; images: number; folders: number; topLevel: boolean }
  /** A file no module takes (or an image that can't be read: `unreadable`, with its `fileId`). */
  | { kind: 'wrong_type'; path: string; ext: string; fileId: number | null; unreadable: boolean }
  | { kind: 'unsupported'; path: string; ext: string }
  /** White notice: the scan moved a video, audio or text file to its module's folder. `to` is from the library root. */
  | { kind: 'moved_file'; from: string; to: string; module: 'videos' | 'audio' | 'texts' }
  | { kind: 'duplicate'; hash: string; thumb: ThumbRef | null; copies: DuplicateCopy[]; keepId: number | null; reason: DuplicateReason };

export interface HealthIssue {
  id: number;
  kind: IssueKind;
  severity: HealthSeverity;
  detectedAt: number;
  details: IssueDetails;
}

export interface HealthReport {
  summary: HealthSummary;
  issues: HealthIssue[];
  /** Untagged images by album (most first). */
  untaggedAlbums: { folderId: number; path: string; count: number; fresh: number }[];
  /** Images set aside with "Leave untagged" (the "Left untagged (n)" link). */
  leftUntagged: number;
  /** Files the user chose to ignore: they stay where they are ("Not tracked", white). */
  untracked: UntrackedFile[];
  /** Ignored and recorded files per format, ever: which formats are worth supporting next. */
  formatStats: { ext: string; ignored: number; recorded: number }[];
  thumbnails: { count: number; bytes: number };
  logs: { files: number; bytes: number };
  lastScan: number | null;
}

export interface UntrackedFile {
  path: string;
  ext: string;
  reason: 'unsupported' | 'wrong_type';
  ignoredAt: number;
}

/** What a fix can be asked to do, per issue kind (technical doc §7.4). */
export type FixAction =
  | { action: 'recreate' } | { action: 'forget' }
  | { action: 'locate'; path: string }
  | { action: 'keep' } | { action: 'undo' }
  | { action: 'pick'; candidateId: number } | { action: 'keep-new' }
  | { action: 'new-album'; name: string } | { action: 'into-album'; albumId: number | null }
  | { action: 'move-out' } | { action: 'convert'; name: string }
  | { action: 'confirm'; folderKind?: 'category' | 'subcategory' | 'album' }
  | { action: 'recycle' } | { action: 'ignore' } | { action: 'record' } | { action: 'ok' }
  | { action: 'keep-one'; keepId: number } | { action: 'merge'; keepId: number };

export interface FixResult {
  message: string;
  /** For fixes that only dismiss an issue (Keep, Keep as new, Confirm): bring it back. */
  reopen?: { kind: IssueKind; subject: string; payload: string };
}
