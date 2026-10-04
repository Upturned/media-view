import type { CollectionDetail, CollectionRef } from '@media-view/shared';
import { client, unwrap } from '../api.ts';
import { fmt } from '../media.ts';
import { href, navigate } from '../router.svelte.ts';
import { word } from '../themes/index.ts';
import { ask } from './confirm.svelte.ts';
import { toast, toastError, type ToastAction } from './toasts.svelte.ts';

/**
 * Collections (milestone 6): the calls behind the collection pages, the Add dialog and the viewer,
 * with the messages and Undo they show.
 */

export const collectionHref = (id: number) => href(`/collections/${id}`);

const images = (n: number) => `${fmt(n)} ${n === 1 ? word('image') : word('images')}`;
const pad = (n: number) => String(n).padStart(2, '0');

function goTo(c: CollectionRef): ToastAction {
  return { label: 'Go to →', run: () => navigate(`/collections/${c.id}`) };
}

/** "2 days ago", for cards and dialogs. */
export function ago(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** Add images at the end of a list; the message says how many were already on it (design M6 · 04). */
export async function addToCollection(c: CollectionRef, ids: number[]): Promise<void> {
  const r = await unwrap(client.api.collections[':id'].items.$post({ param: { id: String(c.id) }, json: { ids } }));
  const msg = r.added === 0
    ? `${r.already === 1 ? 'Already' : `All ${fmt(r.already)} already`} in ${c.name} — nothing added`
    : `Added ${fmt(r.added)} to ${c.name}${r.already ? ` · ${fmt(r.already)} ${r.already === 1 ? 'was' : 'were'} already in it` : ''}`;
  toast(msg, 'info', goTo(c));
}

/** Create a collection and add images to it. */
export async function createAndAdd(name: string, ids: number[]): Promise<void> {
  const c = await unwrap(client.api.collections.$post({ json: { name } }));
  if (ids.length) await unwrap(client.api.collections[':id'].items.$post({ param: { id: String(c.id) }, json: { ids } }));
  toast(`Created ${c.name} · added ${images(ids.length)}`, 'info', goTo(c));
}

/** Take images off a list (never deletes them), with Undo. */
export async function removeFromCollection(c: CollectionRef, ids: number[]): Promise<boolean> {
  try {
    const r = await unwrap(client.api.collections[':id'].items.$delete({ param: { id: String(c.id) }, json: { ids } }));
    toast(`Removed ${fmt(r.removed)} from ${c.name} · the files stay in their albums`, 'info', {
      label: 'Undo',
      run: () => void restoreOrder(c, r.previous),
    });
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

async function restoreOrder(c: CollectionRef, ids: number[]): Promise<void> {
  try {
    await unwrap(client.api.collections[':id'].order.$put({ param: { id: String(c.id) }, json: { ids } }));
  } catch (err) {
    toastError(err);
  }
}

/** Reorder after a drag: `at` is the 0-based place the images land on (for the message). */
export async function reorder(c: CollectionRef, ids: number[], before: number | null, at: number): Promise<void> {
  try {
    const r = await unwrap(client.api.collections[':id'].move.$post({ param: { id: String(c.id) }, json: { ids, before } }));
    const where = ids.length > 1 ? `${pad(at + 1)}–${pad(at + ids.length)}` : pad(at + 1);
    toast(`Moved ${images(ids.length)} to ${where} · saved`, 'info', { label: 'Undo', run: () => void restoreOrder(c, r.previous) });
  } catch (err) {
    toastError(err);
  }
}

/** Delete a list after asking (the images stay); the message offers Undo. Resolves true when deleted. */
export async function deleteCollection(c: CollectionDetail): Promise<boolean> {
  const ok = await ask({
    tone: 'danger',
    title: `Delete “${c.name}”?`,
    sub: `a list of ${images(c.count)} · deletes the list, not the images`,
    body: `Only the list and its order go away. ${c.count === 1 ? 'The image stays' : `All ${fmt(c.count)} images stay`} where they are, in their albums, with their tags, stars and other collections. Nothing goes to the Recycle Bin.`,
    items: c.albums.map((a) => ({ name: a.path, note: `${fmt(a.count)} stay${a.count === 1 ? 's' : ''}` })),
    button: 'Delete collection',
    foot: 'Undo is offered for a few seconds',
  });
  if (!ok) return false;
  try {
    const snap = await unwrap(client.api.collections[':id'].$delete({ param: { id: String(c.id) } }));
    toast(`Deleted “${c.name}” · the images stay where they are`, 'info', {
      label: 'Undo',
      run: () => {
        unwrap(client.api.collections.restore.$post({ json: snap }))
          .then((back) => toast(`“${back.name}” is back.`, 'info', goTo(back)))
          .catch(toastError);
      },
    });
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}

/** Set a list's cover (null = back to the first image). */
export async function setCollectionCover(c: CollectionRef, fileId: number | null): Promise<void> {
  try {
    await unwrap(client.api.collections[':id'].$patch({ param: { id: String(c.id) }, json: { coverFileId: fileId } }));
    toast(fileId === null ? `${c.name} uses its first image as the cover again.` : `Cover of ${c.name} set.`);
  } catch (err) {
    toastError(err);
  }
}
