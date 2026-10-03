import type { LibraryInfo } from '@media-view/shared';
import { ApiError, client, unwrap } from '../api.ts';
import { toast } from './toasts.svelte.ts';

export const library = $state({
  info: null as LibraryInfo | null,
  loaded: false,
  busy: false,
});

export async function refreshLibrary(): Promise<void> {
  try {
    library.info = (await unwrap(client.api.library.$get())).library;
  } finally {
    library.loaded = true;
  }
}

async function run(action: () => Promise<LibraryInfo | null>): Promise<boolean> {
  library.busy = true;
  try {
    const info = await action();
    if (!info) return false;
    library.info = info;
    toast(`Opened library “${info.name}”.`);
    return true;
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), 'error');
    return false;
  } finally {
    library.busy = false;
  }
}

async function pickFolder(title: string): Promise<string | null> {
  return (await unwrap(client.api.system['pick-folder'].$post({ json: { title } }))).path;
}

async function openOrOfferCreate(path: string): Promise<LibraryInfo | null> {
  try {
    return (await unwrap(client.api.library.open.$post({ json: { path } }))).library;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'NOT_A_LIBRARY'
      && confirm(`“${path}” isn't a media-view library yet.\n\nCreate a new library in this folder? Existing files are kept.`)) {
      return (await unwrap(client.api.library.create.$post({ json: { path } }))).library;
    }
    throw err;
  }
}

export const openLibraryAt = (path: string) => run(() => openOrOfferCreate(path));

export const pickAndOpenLibrary = () => run(async () => {
  const path = await pickFolder('Open library');
  return path ? openOrOfferCreate(path) : null;
});

export const pickAndCreateLibrary = () => run(async () => {
  const path = await pickFolder('Choose a folder for the new library');
  return path ? (await unwrap(client.api.library.create.$post({ json: { path } }))).library : null;
});
