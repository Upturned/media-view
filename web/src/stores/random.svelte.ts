import { client, unwrap } from '../api.ts';
import { navigate } from '../router.svelte.ts';
import { toParams, viewerHref, type ListQuery } from '../media.ts';
import { toastError } from './toasts.svelte.ts';

/**
 * Random in the top bar (milestone 8): an image from the list the page shows (an album, a tag, a
 * collection, a search…), else from the whole library. Pages with a list register it here.
 */

interface Scope {
  query: ListQuery;
  /** "this album", "images tagged Elves": for the button's tooltip. */
  where: string;
  /** The image on screen (the viewer): never picked twice in a row. */
  exclude?: number;
}

const state = $state<{ scope: Scope | null }>({ scope: null });

export const randomScope = () => state.scope;

/** Register the page's list while it's shown (call from a component's script). */
export function useRandomScope(get: () => Scope): void {
  $effect(() => {
    const scope = get();
    state.scope = scope;
    return () => {
      if (state.scope === scope) state.scope = null;
    };
  });
}

const WHOLE_LIBRARY: ListQuery = { sort: 'name', order: 'asc' };

export async function openRandom(): Promise<void> {
  const scope = state.scope;
  try {
    const pick = async (q: ListQuery, exclude?: number) =>
      (await unwrap(client.api.files.random.$get({ query: { ...toParams(q), ...(exclude ? { exclude: String(exclude) } : {}) } }))).id;
    let q = scope?.query ?? WHOLE_LIBRARY;
    let id = await pick(q, scope?.exclude);
    // An empty page: the whole library instead.
    if (!id && scope) id = await pick((q = WHOLE_LIBRARY));
    if (id) navigate(viewerHref(id, q).slice(1));
  } catch (err) {
    toastError(err);
  }
}
