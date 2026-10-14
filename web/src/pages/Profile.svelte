<script lang="ts">
  import { tagToken, type FileItem, type ProfileInfo, type ProfileRole, type ProfileTag } from '@media-view/shared';
  import Avatar from '../components/Avatar.svelte';
  import LinkTagDialog from '../components/LinkTagDialog.svelte';
  import ProfileDialog from '../components/ProfileDialog.svelte';
  import ProfilePictureDialog from '../components/ProfilePictureDialog.svelte';
  import TagChip from '../components/TagChip.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { client, unwrap } from '../api.ts';
  import { fmt, viewerHref, type ListQuery } from '../media.ts';
  import { href, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { profile, ROLE_LABEL, setPassword, unlinkTag, updateMe } from '../stores/profile.svelte.ts';
  import { toast, toastError } from '../stores/toasts.svelte.ts';

  /**
   * A profile's page (docs/profiles.md §4.4): *Images by me* and *Featuring you* (saved searches over
   * the linked tags, written with their types), your favorites, and the linked tags. Other profiles'
   * pages can be viewed (not their favorites); editing one means switching to it.
   */
  const STRIP = 12;
  const COLORS = ['#ff4b2b', '#3d8bfd', '#2fb67c', '#c56cf0', '#f5a623', '#16b8c4', '#e8578d', '#8d99ae'];

  const id = $derived(Number(router.route.params.id));
  const isMe = $derived(profile.me?.id === id);
  let info = $state<ProfileInfo | null>(null);
  let tags = $state<ProfileTag[]>([]);
  type Strip = { items: FileItem[]; total: number; query: ListQuery } | null;
  let strips = $state<Record<ProfileRole | 'favorites', Strip>>({ creator: null, subject: null, favorites: null });
  let dialog = $state<'rename' | 'password' | 'picture' | null>(null);
  let linking = $state<ProfileRole | null>(null);

  /** The search for a role's section: any of its tags, each with its type (the same name can be two tags). */
  const queryOf = (role: ProfileRole) => tags.filter((t) => t.role === role).map((t) => tagToken('any', t.typeKey, t.name)).join(' ');

  async function strip(query: ListQuery): Promise<Strip> {
    const params: Record<string, string> = { sort: query.sort, order: query.order, limit: String(STRIP) };
    if (query.q) params.q = query.q;
    if (query.favorites) params.favorites = '1';
    const r = await unwrap(client.api.files.$get({ query: params }));
    return { items: r.items, total: r.total, query };
  }

  // The profile, its links, and its sections; again when files or links change.
  $effect(() => {
    void live.files;
    void live.profile;
    const target = id;
    const mine = isMe;
    (async () => {
      const [p, t] = await Promise.all([
        unwrap(client.api.profiles[':id'].$get({ param: { id: String(target) } })),
        unwrap(client.api.profiles[':id'].tags.$get({ param: { id: String(target) } })),
      ]);
      info = p;
      tags = t.tags;
      const next: typeof strips = { creator: null, subject: null, favorites: null };
      for (const role of ['creator', 'subject'] as const) {
        const q = queryOf(role);
        // No linked tags: an empty section, never a search (an empty one would match every image).
        if (q) next[role] = await strip({ q, sort: 'added', order: 'desc' });
      }
      if (mine) next.favorites = await strip({ favorites: true, sort: 'added', order: 'desc' });
      strips = next;
    })().catch(toastError);
  });

  async function unlink(t: ProfileTag) {
    try {
      tags = await unlinkTag(t.id, t.role);
      toast(`Unlinked “${t.name}”.`);
    } catch (err) {
      toastError(err);
    }
  }

  function tagMenu(e: MouseEvent, t: ProfileTag) {
    openMenu(e, t.name, [
      { label: 'Open wiki page', action: () => (location.hash = `#/tags/${t.id}`) },
      ...(isMe ? [{ label: `Unlink from ${ROLE_LABEL[t.role]}`, danger: true, separated: true, action: () => void unlink(t) }] : []),
    ]);
  }

  async function usePicture(fileId: number | null) {
    dialog = null;
    try {
      await updateMe({ pictureFileId: fileId });
    } catch (err) {
      toastError(err);
    }
  }
</script>

{#snippet section(role: ProfileRole | 'favorites', title: string, empty: string, seeAll: string | null)}
  {@const s = strips[role]}
  <section class="panel sec">
    <header>
      <h2>{title}</h2>
      {#if s}<span class="n mono">{fmt(s.total)}</span>{/if}
      {#if role !== 'favorites' && isMe}<button class="btn small" onclick={() => (linking = role)}>Link a tag…</button>{/if}
      {#if seeAll && s?.total}<a class="btn small" href={seeAll}>See all</a>{/if}
    </header>
    {#if role !== 'favorites'}
      <div class="chips">
        {#each tags.filter((t) => t.role === role) as t (t.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="linked" oncontextmenu={(e) => tagMenu(e, t)}>
            <TagChip tag={t} />
            {#if isMe}<button class="x" title="Unlink" aria-label="Unlink {t.name}" onclick={() => void unlink(t)}>×</button>{/if}
          </span>
        {/each}
      </div>
    {/if}
    {#if s?.items.length}
      <div class="strip">
        {#each s.items as f (f.id)}
          <a class="tile" href={viewerHref(f.id, s.query)} title={f.filename}><Thumb file={f} fit="cover" /></a>
        {/each}
      </div>
    {:else}
      <p class="empty">{empty}</p>
    {/if}
  </section>
{/snippet}

<div class="page">
  {#if info}
    <div class="page-header">
      <div class="who">
        <Avatar p={info} size={112} />
        <div>
          <div class="label">{isMe ? 'Your profile' : 'Profile'}</div>
          <h1>{info.name}</h1>
          {#if isMe}
            <div class="actions">
              <button class="btn" onclick={() => (dialog = 'rename')}>Rename…</button>
              <button class="btn" onclick={() => (dialog = 'picture')}>Picture…</button>
              <button class="btn" onclick={() => (dialog = 'password')}>{info.hasPassword ? 'Password…' : 'Set a password…'}</button>
              {#if !info.picture}
                <span class="colors" title="Color behind your initials">
                  {#each COLORS as c (c)}
                    <button class="color" class:on={info.color === c} style:background={c} aria-label="Color {c}" onclick={() => updateMe({ color: c }).catch(toastError)}></button>
                  {/each}
                </span>
              {/if}
            </div>
          {:else}
            <p class="muted">To change this profile, switch to it.</p>
          {/if}
        </div>
      </div>
    </div>

    {@render section('creator', ROLE_LABEL.creator, tags.some((t) => t.role === 'creator')
      ? 'No images with these tags yet.'
      : isMe ? 'Link the tags that are your work — your artist name, your studio — and their images show here.' : 'No tags linked.',
      queryOf('creator') ? href(`/search?q=${encodeURIComponent(queryOf('creator'))}`) : null)}
    {@render section('subject', ROLE_LABEL.subject, tags.some((t) => t.role === 'subject')
      ? 'No images with these tags yet.'
      : isMe ? 'Link the tags that are you — as a model, a self-portrait, a character you play — and their images show here.' : 'No tags linked.',
      queryOf('subject') ? href(`/search?q=${encodeURIComponent(queryOf('subject'))}`) : null)}
    {#if isMe}
      {@render section('favorites', 'Favorites', 'Nothing starred yet.', href('/favorites'))}
    {/if}
  {/if}
</div>

{#if dialog === 'rename' && info}
  <ProfileDialog mode="rename" title="Rename profile" confirm="Rename" initialName={info.name} onsubmit={(r) => updateMe({ name: r.name })} onclose={() => (dialog = null)} />
{:else if dialog === 'password' && info}
  <ProfileDialog
    mode="password"
    title={info.hasPassword ? 'Change password' : 'Set a password'}
    sub={info.name}
    confirm={info.hasPassword ? 'Change' : 'Set password'}
    hasPassword={info.hasPassword}
    onsubmit={async (r) => {
      await setPassword(r.current, r.password);
      toast(r.password === null ? 'Password removed.' : 'Password saved.');
    }}
    onclose={() => (dialog = null)}
  />
{:else if dialog === 'picture' && info}
  <ProfilePictureDialog current={info.pictureFileId} onuse={(f) => void usePicture(f)} onclose={() => (dialog = null)} />
{/if}
{#if linking}
  <LinkTagDialog role={linking} onclose={() => (linking = null)} />
{/if}

<style>
  .who { display: flex; align-items: center; gap: 22px; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
  .colors { display: inline-flex; gap: 4px; margin-left: 6px; }
  .color { width: 20px; height: 20px; padding: 0; border: 2px solid transparent; cursor: pointer; }
  .color.on { border-color: var(--text); }
  .muted { color: var(--text2); font-size: 13px; margin: 6px 0 0; }
  .sec { padding: 18px 20px; margin-bottom: 16px; }
  .sec header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .sec h2 { margin: 0; font: 700 20px/1 var(--font-display); text-transform: uppercase; letter-spacing: 0.03em; }
  .n { color: var(--text2); font-size: 12px; margin-right: auto; }
  .btn.small { padding: 4px 10px; font-size: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .chips:empty { display: none; }
  .linked { display: inline-flex; align-items: stretch; }
  .x { padding: 0 6px; border: 1px solid var(--line); border-left: none; background: var(--surface); color: var(--text2); cursor: pointer; }
  .x:hover { color: var(--red); }
  .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
  .tile { aspect-ratio: 1; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .tile:hover { outline: 2px solid var(--text); }
  .empty { margin: 0; color: var(--text2); font-size: 13.5px; }
</style>
