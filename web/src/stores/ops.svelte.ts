import type { FolderKind } from '@media-view/shared';
import { ApiError, client, unwrap } from '../api.ts';
import { fmt } from '../media.ts';
import { word } from '../themes/index.ts';
import { folderHref, navigate } from '../router.svelte.ts';
import { ask } from './confirm.svelte.ts';
import { toast, toastError, type ToastAction } from './toasts.svelte.ts';

/**
 * File and folder operations shared by the grid, the viewer, the cards and the Recycle Bin
 * (milestone 3): the dialogs they open and the calls behind them.
 */

export interface BinEntry {
  id: number;
  entity: 'file' | 'folder';
  name: string;
  kind: string;
}

export type ClashPolicy = 'keep-both' | 'replace' | 'skip';

export type OpsDialog =
  | {
    kind: 'transfer';
    mode: 'move' | 'copy';
    files: { id: number; filename: string }[];
    from: string;
    currentFolderId: number | null;
    /** Called after a move that placed at least one image (the viewer steps on from there). */
    onmoved?: () => void;
  }
  | { kind: 'folder-move'; folder: { id: number; name: string; kind: FolderKind; parentId: number | null } }
  | { kind: 'restore'; items: BinEntry[] }
  | { kind: 'rename-file'; file: { id: number; filename: string; v: string }; where: string }
  | { kind: 'rename-folder'; folder: { id: number; name: string; kind: FolderKind } }
  | { kind: 'bulk-rename'; files: { id: number; filename: string; folderId: number }[]; where: string; order: string }
  | { kind: 'edit-tag'; tagId: number }
  | { kind: 'bulk-tag'; files: { id: number; filename: string }[]; where: string }
  /** New collection (id null, optionally with a name) or edit one (design M6 · 03). */
  | { kind: 'collection-edit'; id: number | null; name?: string }
  /** Add images to a collection, or create one for them (design M6 · 04). */
  | { kind: 'add-to-collection'; files: { id: number; filename: string }[]; where: string };

export const ops = $state({ dialog: null as OpsDialog | null });

export function openOps(dialog: OpsDialog): void {
  ops.dialog = dialog;
}

export function closeOps(): void {
  ops.dialog = null;
}

const images = (n: number) => `${fmt(n)} ${n === 1 ? word('image') : word('images')}`;

// ─── Images ──────────────────────────────────────────────────────────────────

/** Move or copy images into an album (or the Inbox); the toast offers to go there. Resolves to how many were placed. */
export async function transfer(mode: 'move' | 'copy', ids: number[], dest: { id: number; name: string; kind: string }, policy: ClashPolicy, copyTags = true): Promise<number> {
  const goTo: ToastAction = {
    label: `Go to ${dest.name.length > 24 ? `${dest.name.slice(0, 23)}…` : dest.name}`,
    run: () => navigate(folderHref(dest).slice(1)),
  };
  if (mode === 'move') {
    const r = await unwrap(client.api.files.move.$post({ json: { ids, folderId: dest.id, policy } }));
    const extra = [r.renamed.length ? `${r.renamed.length} renamed` : '', r.skipped.length ? `${r.skipped.length} skipped` : '', r.replaced ? `${r.replaced} replaced` : '']
      .filter(Boolean).join(' · ');
    const undo: ToastAction = {
      label: 'Undo',
      run: () => {
        unwrap(client.api.files['undo-move'].$post({ json: { items: r.undo } }))
          .then((u) => toast(`Moved ${images(u.done)} back.`))
          .catch(toastError);
      },
    };
    toast(`Moved ${images(r.done)} to ${dest.name}.${extra ? ` (${extra})` : ''}`, 'info', [...(r.done ? [goTo] : []), ...(r.undo.length ? [undo] : [])]);
    return r.done;
  } else {
    const r = await unwrap(client.api.files.copy.$post({ json: { ids, folderId: dest.id, policy, copyTags } }));
    const extra = [r.renamed.length ? `${r.renamed.length} renamed` : '', r.skipped.length ? `${r.skipped.length} skipped` : ''].filter(Boolean).join(' · ');
    toast(`Copied ${images(r.done)} to ${dest.name}.${extra ? ` (${extra})` : ''}`, 'info', r.done ? goTo : undefined);
    return r.done;
  }
}

/** Recycle images; starred ones are protected, so ask first when some are starred (design M3 · 05). */
export async function recycleImages(files: { id: number; filename: string; favorited: boolean }[]): Promise<boolean> {
  const starred = files.filter((f) => f.favorited);
  if (starred.length === files.length) {
    await ask({
      tone: 'starred',
      refusal: true,
      title: files.length === 1 ? 'This image is starred' : 'These images are starred',
      body: 'Starred images are protected and won’t be recycled. Unstar them first if you really want them gone.',
      button: '',
      foot: '',
    });
    return false;
  }
  if (starred.length > 0) {
    const ok = await ask({
      tone: 'starred',
      title: `Recycle ${files.length - starred.length} of ${files.length} ${word('images')}?`,
      sub: `${starred.length} selected ${starred.length === 1 ? 'image is' : 'images are'} starred`,
      body: 'Starred images are protected and won’t be recycled. Unstar them first if you really want them gone.',
      items: [
        ...starred.map((f) => ({ name: f.filename, note: 'starred · stays', kept: true })),
        ...files.filter((f) => !f.favorited).map((f) => ({ name: f.filename, note: 'to bin' })),
      ].slice(0, 60),
      button: `Recycle ${images(files.length - starred.length)}`,
    });
    if (!ok) return false;
  }
  try {
    const r = await unwrap(client.api.files.recycle.$post({ json: { ids: files.filter((f) => !f.favorited).map((f) => f.id) } }));
    toast(`Sent ${images(r.recycled)} to the Recycle Bin.`);
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

export async function setCover(folderId: number, folderName: string, fileId: number): Promise<void> {
  try {
    await unwrap(client.api.folders[':id'].$patch({ param: { id: String(folderId) }, json: { coverFileId: fileId } }));
    toast(`Cover of ${folderName} set.`);
  } catch (err) {
    toastError(err);
  }
}

export function openWith(fileId: number): void {
  unwrap(client.api.system['open-with'].$post({ json: { fileId } })).catch(toastError);
}

export async function setStar(ids: number[], favorited: boolean): Promise<void> {
  try {
    await unwrap(client.api.files.favorite.$post({ json: { ids, favorited } }));
    if (ids.length > 1) toast(`${favorited ? 'Starred' : 'Unstarred'} ${images(ids.length)}.`);
  } catch (err) {
    toastError(err);
  }
}

// ─── Folders ─────────────────────────────────────────────────────────────────

/** Recycle a folder (restorable, so no confirmation); refused while it holds starred images. */
export async function recycleFolder(folder: { id: number; name: string }): Promise<boolean> {
  try {
    await unwrap(client.api.folders[':id'].recycle.$post({ param: { id: String(folder.id) } }));
    toast(`Sent “${folder.name}” to the Recycle Bin.`);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'STARRED_INSIDE') {
      await ask({ tone: 'starred', refusal: true, title: `Can’t recycle “${folder.name}”`, body: err.message, button: '', foot: '' });
    } else toastError(err);
    return false;
  }
}

// ─── Recycle Bin ─────────────────────────────────────────────────────────────

export async function restoreItems(items: BinEntry[], targetFolderId?: number | null): Promise<void> {
  let ok = 0;
  const failed: string[] = [];
  for (const item of items) {
    try {
      await unwrap(client.api.recycle[':id'].restore.$post({ param: { id: String(item.id) }, json: targetFolderId === undefined ? {} : { targetFolderId } }));
      ok++;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LOCATION_GONE') failed.push(item.name);
      else toastError(err);
    }
  }
  if (ok) toast(`Restored ${ok} ${ok === 1 ? 'item' : 'items'}${failed.length ? ` · ${failed.length} need Restore to… (location gone)` : ''}.`);
  else if (failed.length) toast('The original location is gone — use Restore to… and pick a new place.', 'error');
}
