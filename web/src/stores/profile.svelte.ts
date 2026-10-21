import type { ActiveProfile, ProfileInfo, ProfilePrefs, ProfileRole, ProfileTag } from '@media-view/shared';
import { client, unwrap } from '../api.ts';
import { browserPrefs, useProfilePrefs } from '../prefs.ts';
import { applyTheme } from '../themes/index.ts';
import { toastError } from './toasts.svelte.ts';

/**
 * Local profiles (docs/profiles.md): the profile in use and the others of the open library. A switch
 * or a lock reloads the app, so every page starts over with the new profile's stars and preferences.
 */
export const profile = $state({
  list: [] as ProfileInfo[],
  /** The profile in use; null without a library, or while the picker shows. */
  me: null as ActiveProfile | null,
  /** A library is open but no profile is chosen yet: the picker shows. */
  locked: false,
  loaded: false,
});

// ─── Preferences, saved with the profile ─────────────────────────────────────

let pending: Record<string, unknown> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function savePref(key: string, value: unknown): void {
  pending[key] = value;
  if (key === 'theme') applyTheme(String(value));
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const change = pending as ProfilePrefs;
    pending = {};
    saveTimer = null;
    unwrap(client.api.profiles.me.prefs.$patch({ json: change })).catch(toastError);
  }, 400);
}

// ─── Loading ─────────────────────────────────────────────────────────────────

/** Load the profiles of the open library (or clear them without one), and take on the profile's preferences and theme. */
export async function loadProfile(hasLibrary: boolean): Promise<void> {
  try {
    if (!hasLibrary) {
      Object.assign(profile, { list: [], me: null, locked: false });
      useProfilePrefs(null, savePref);
      return;
    }
    const r = await unwrap(client.api.profiles.$get());
    profile.list = r.profiles;
    if (r.active === null) {
      Object.assign(profile, { me: null, locked: true });
      useProfilePrefs(null, savePref);
      // No profile yet: the picker wears the last theme used on this computer.
      applyTheme((await unwrap(client.api.settings.ui.$get())).theme);
      return;
    }
    let me = await unwrap(client.api.profiles.me.$get());
    // The first profile after the upgrade: this browser's saved preferences become its own, once.
    if (me.prefs._import) me = { ...me, prefs: await unwrap(client.api.profiles.me['import-prefs'].$post({ json: browserPrefs() })) };
    Object.assign(profile, { me, locked: false });
    useProfilePrefs({ ...me.prefs }, savePref);
    applyTheme(me.prefs.theme ?? 'darkroom');
  } finally {
    profile.loaded = true;
  }
}

/** The profile in use, or the list, changed elsewhere (a rename, a new profile, links): refresh without a reload. */
export async function refreshProfiles(): Promise<void> {
  if (!profile.me && !profile.locked) return;
  const r = await unwrap(client.api.profiles.$get());
  profile.list = r.profiles;
  if (profile.me && r.active === profile.me.id) {
    const me = await unwrap(client.api.profiles.me.$get());
    profile.me = { ...me, prefs: profile.me.prefs };
  }
}

/** Another tab switched or locked: reload when this tab's profile is no longer the one in use. */
export async function checkSwitched(): Promise<void> {
  if (!profile.loaded) return;
  const r = await unwrap(client.api.profiles.$get()).catch(() => null);
  if (r && r.active !== (profile.me?.id ?? null)) location.reload();
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Open a profile (its password when it has one). The app reloads as that profile. */
export async function switchTo(id: number, password?: string): Promise<void> {
  if (saveTimer) await flushPrefs();
  await unwrap(client.api.profiles.switch.$post({ json: { id, password } }));
  location.reload();
}

/** Back to the picker. */
export async function lock(): Promise<void> {
  if (saveTimer) await flushPrefs();
  await unwrap(client.api.profiles.lock.$post());
  location.reload();
}

async function flushPrefs(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const change = pending as ProfilePrefs;
  pending = {};
  if (Object.keys(change).length) await unwrap(client.api.profiles.me.prefs.$patch({ json: change })).catch(() => undefined);
}

export async function createProfile(name: string, password: string | null): Promise<ProfileInfo> {
  const p = await unwrap(client.api.profiles.$post({ json: { name, password } }));
  profile.list = (await unwrap(client.api.profiles.$get())).profiles;
  return p;
}

export async function updateMe(change: { name?: string; pictureFileId?: number | null; color?: string }): Promise<void> {
  const me = await unwrap(client.api.profiles.me.$patch({ json: change }));
  profile.me = { ...me, prefs: profile.me?.prefs ?? me.prefs };
  profile.list = (await unwrap(client.api.profiles.$get())).profiles;
}

/** Set, change or remove (`next: null`) the password of the profile in use. */
export async function setPassword(current: string | undefined, next: string | null): Promise<void> {
  const me = await unwrap(client.api.profiles.me.password.$post({ json: { current, next } }));
  profile.me = { ...me, prefs: profile.me?.prefs ?? me.prefs };
  profile.list = (await unwrap(client.api.profiles.$get())).profiles;
}

export async function deleteProfile(id: number, password?: string): Promise<void> {
  await unwrap(client.api.profiles[':id'].$delete({ param: { id: String(id) }, json: { password } }));
  profile.list = (await unwrap(client.api.profiles.$get())).profiles;
}

export async function linkTag(tagId: number, role: ProfileRole): Promise<ProfileTag[]> {
  return (await unwrap(client.api.profiles.me.tags.$put({ json: { tagId, role } }))).tags;
}

export async function unlinkTag(tagId: number, role: ProfileRole): Promise<ProfileTag[]> {
  return (await unwrap(client.api.profiles.me.tags.$delete({ json: { tagId, role } }))).tags;
}

export const ROLE_LABEL: Record<ProfileRole, string> = { creator: 'Images by me', subject: 'Featuring you' };
