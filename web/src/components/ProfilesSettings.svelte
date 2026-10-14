<script lang="ts">
  import type { ProfileInfo } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { navItems } from '../kbd.svelte.ts';
  import { fmt } from '../media.ts';
  import { href } from '../router.svelte.ts';
  import { ask } from '../stores/confirm.svelte.ts';
  import { createProfile, deleteProfile, profile, setPassword, switchTo, updateMe } from '../stores/profile.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';
  import Avatar from './Avatar.svelte';
  import ProfileDialog from './ProfileDialog.svelte';
  import ProfilePictureDialog from './ProfilePictureDialog.svelte';

  /**
   * Settings → Profiles (docs/profiles.md §4.5). Only the profile in use can be changed (every change
   * is made as yourself); the others can be switched to or deleted.
   */
  type Dialog =
    | { kind: 'new' } | { kind: 'rename' } | { kind: 'password' } | { kind: 'picture' }
    | { kind: 'unlock-switch'; p: ProfileInfo } | { kind: 'unlock-delete'; p: ProfileInfo };
  let dialog = $state<Dialog | null>(null);

  const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

  function open(p: ProfileInfo) {
    if (p.hasPassword) dialog = { kind: 'unlock-switch', p };
    else switchTo(p.id).catch(toastError);
  }

  async function remove(p: ProfileInfo) {
    try {
      const impact = await unwrap(client.api.profiles[':id'].impact.$get({ param: { id: String(p.id) } }));
      const ok = await ask({
        tone: 'danger',
        title: `Delete the profile “${p.name}”?`,
        body: `${p.name}’s ${plural(impact.favorites, 'favorite', 'favorites')} and ${plural(impact.links, 'tag link', 'tag links')} will be removed. Images, tags and collections stay.`,
        button: 'Delete profile',
      });
      if (!ok) return;
      if (p.hasPassword) dialog = { kind: 'unlock-delete', p };
      else await finishDelete(p);
    } catch (err) {
      toastError(err);
    }
  }

  async function finishDelete(p: ProfileInfo, password?: string) {
    await deleteProfile(p.id, password);
    toast(`Deleted the profile “${p.name}”.`);
  }
</script>

<section class="panel">
  <h2 class="label">Profiles</h2>
  <p class="muted intro">Each profile has its own stars, settings and linked tags. Images, tags and collections are shared.</p>
  <div class="rows" use:navItems={{ kind: 'rows' }}>
    {#each profile.list as p (p.id)}
      <div class="row" data-nav>
        <Avatar {p} size={36} />
        <a class="name" href={href(`/profile/${p.id}`)}>{p.name}</a>
        {#if p.active}<span class="tag in-use">in use</span>{/if}
        {#if p.hasPassword}<span class="tag">password</span>{/if}
        <span class="push"></span>
        {#if p.active}
          <button class="btn" data-nav-open onclick={() => (dialog = { kind: 'rename' })}>Rename…</button>
          <button class="btn" onclick={() => (dialog = { kind: 'picture' })}>Picture…</button>
          <button class="btn" onclick={() => (dialog = { kind: 'password' })}>{p.hasPassword ? 'Password…' : 'Set a password…'}</button>
        {:else}
          <button class="btn" data-nav-open onclick={() => open(p)}>Switch to…</button>
          <button class="btn danger" data-nav-delete onclick={() => void remove(p)}>Delete…</button>
        {/if}
      </div>
    {/each}
  </div>
  <button class="btn" onclick={() => (dialog = { kind: 'new' })}>New profile…</button>
</section>

{#if dialog?.kind === 'new'}
  <ProfileDialog
    mode="new"
    title="New profile"
    sub="your own stars, settings and tags · images and tags stay shared"
    confirm="Create"
    onsubmit={async (r) => {
      const p = await createProfile(r.name, r.password);
      toast(`Made the profile “${p.name}”. Switch to it from here or the profile menu.`);
    }}
    onclose={() => (dialog = null)}
  />
{:else if dialog?.kind === 'rename' && profile.me}
  <ProfileDialog mode="rename" title="Rename profile" confirm="Rename" initialName={profile.me.name} onsubmit={(r) => updateMe({ name: r.name })} onclose={() => (dialog = null)} />
{:else if dialog?.kind === 'password' && profile.me}
  <ProfileDialog
    mode="password"
    title={profile.me.hasPassword ? 'Change password' : 'Set a password'}
    sub={profile.me.name}
    confirm={profile.me.hasPassword ? 'Change' : 'Set password'}
    hasPassword={profile.me.hasPassword}
    onsubmit={async (r) => {
      await setPassword(r.current, r.password);
      toast(r.password === null ? 'Password removed.' : 'Password saved.');
    }}
    onclose={() => (dialog = null)}
  />
{:else if dialog?.kind === 'picture' && profile.me}
  <ProfilePictureDialog
    current={profile.me.pictureFileId}
    onuse={(f) => {
      dialog = null;
      updateMe({ pictureFileId: f }).catch(toastError);
    }}
    onclose={() => (dialog = null)}
  />
{:else if dialog?.kind === 'unlock-switch'}
  {@const p = dialog.p}
  <ProfileDialog mode="unlock" title="Open {p.name}" sub="this profile has a password" confirm="Open" onsubmit={(r) => switchTo(p.id, r.password ?? undefined)} onclose={() => (dialog = null)} />
{:else if dialog?.kind === 'unlock-delete'}
  {@const p = dialog.p}
  <ProfileDialog mode="unlock" title="Delete {p.name}" sub="its password is needed to delete it" confirm="Delete" onsubmit={(r) => finishDelete(p, r.password ?? undefined)} onclose={() => (dialog = null)} />
{/if}

<style>
  section { padding: 24px; margin-bottom: 16px; }
  h2 { margin-bottom: 16px; }
  .muted { color: var(--text2); font-size: 13px; }
  .intro { margin: -6px 0 10px; }
  .rows { margin-bottom: 14px; }
  .row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--surface2); }
  .name { font-weight: 600; font-size: 15px; color: var(--text); text-decoration: none; }
  .name:hover { text-decoration: underline; }
  .tag { padding: 2px 6px; border: 1px solid var(--line); color: var(--text2); font: 10px var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; }
  .tag.in-use { border-color: var(--accent); color: var(--accent); }
  .push { flex: 1; }
  .btn.danger:hover { color: var(--red); border-color: var(--red); }
</style>
