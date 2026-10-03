<script lang="ts">
  import type { FolderCard, FolderDetail, FolderKind } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import Breadcrumbs from '../components/Breadcrumbs.svelte';
  import FolderCardView from '../components/FolderCardView.svelte';
  import KindIcon from '../components/KindIcon.svelte';
  import NameDialog from '../components/NameDialog.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { fmt } from '../media.ts';
  import { folderHref, href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import { isStyled, word } from '../themes/index.ts';

  /** A category or sub-category: its sub-categories and albums (user guide §4.3). */

  const id = $derived(Number(router.route.params.id));
  let folder = $state<FolderDetail | null>(null);
  let children: FolderCard[] = $state([]);
  let notFound = $state(false);
  let creating = $state<FolderKind | null>(null);

  $effect(() => {
    void live.folders;
    void live.files;
    const current = id;
    Promise.all([
      unwrap(client.api.folders[':id'].$get({ param: { id: String(current) } })),
      unwrap(client.api.folders.$get({ query: { parent: String(current) } })),
    ])
      .then(([detail, list]) => {
        if (current !== id) return;
        // Albums and the Inbox have their own page.
        if (detail.kind === 'album' || detail.kind === 'inbox') {
          navigate(folderHref(detail).slice(1), { replace: true });
          return;
        }
        folder = detail;
        children = list.children ?? [];
        notFound = false;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) notFound = true;
        else toast((err as Error).message, 'error');
      });
  });

  const drawers = $derived(children.filter((c) => c.kind === 'subcategory'));
  const albums = $derived(children.filter((c) => c.kind === 'album'));
  const kindWord = $derived(folder?.kind === 'category' ? word('category') : word('subcategory'));

  async function create(name: string) {
    if (!folder || !creating) return;
    const card = await unwrap(client.api.folders.$post({ json: { parentId: folder.id, kind: creating as 'subcategory' | 'album', name } }));
    toast(`Created “${card.name}”.`);
  }
</script>

<div class="page">
  {#if notFound}
    <p class="missing">This folder no longer exists. <a href={href('/images')}>Back to the Library</a></p>
  {:else if folder}
    <Breadcrumbs crumbs={[...folder.ancestors, { id: folder.id, kind: folder.kind, name: folder.name }]} />

    <header class="head">
      <div class="cover">
        <Thumb file={folder.covers[0]} fit="cover" />
      </div>
      <div class="info">
        <span class="kind"><KindIcon kind={folder.kind} size={13} />{kindWord}{isStyled(folder.kind === 'category' ? 'category' : 'subcategory') ? ` · ${folder.kind === 'category' ? 'category' : 'sub-category'}` : ''}</span>
        <h1 class="display title">{folder.name}</h1>
        {#if folder.description}<p class="desc">{folder.description}</p>{/if}
        <div class="stats">
          <div class="stat"><b>{fmt(folder.imageCount)}</b>{word('images')} under here</div>
          <div class="stat"><b>{folder.subcategoryCount}</b>{folder.subcategoryCount === 1 ? word('subcategory') : word('subcategories')}</div>
          <div class="stat"><b>{folder.albumCount}</b>{folder.albumCount === 1 ? 'album' : 'albums'}</div>
        </div>
        <div class="actions">
          <div class="btn-group">
            <button class="btn" onclick={() => (creating = 'subcategory')}>+ New {word('subcategory').toLowerCase()}</button>
            <button class="btn" onclick={() => (creating = 'album')}>+ New album</button>
          </div>
          {#if folder.imageCount > 0}
            <a class="btn primary" href={href(`/images/f/${folder.id}/all`)}>View all {fmt(folder.imageCount)} {word('images')} →</a>
          {/if}
        </div>
      </div>
    </header>

    {#if drawers.length > 0}
      <div class="section-title"><strong>{word('subcategories')}</strong><span>{drawers.length} {drawers.length === 1 ? 'sub-category' : 'sub-categories'}</span></div>
      <div class="grid">
        {#each drawers as d (d.id)}<FolderCardView folder={d} />{/each}
      </div>
    {/if}

    {#if albums.length > 0}
      <div class="section-title"><strong>Albums</strong><span>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</span></div>
      <div class="grid albums">
        {#each albums as a (a.id)}<FolderCardView folder={a} />{/each}
      </div>
    {/if}

    {#if children.length === 0}
      <div class="empty">This {kindWord.toLowerCase()} is empty — add an album or a {word('subcategory').toLowerCase()}.</div>
    {/if}
  {/if}
</div>

{#if creating}
  <NameDialog
    title={creating === 'album' ? 'New album' : `New ${word('subcategory').toLowerCase()}`}
    label="Name"
    onsubmit={create}
    onclose={() => (creating = null)}
  />
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 22px; padding-top: 22px; }

  .head {
    display: grid;
    grid-template-columns: minmax(240px, 440px) 1fr;
    gap: 36px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--line);
  }
  .cover { aspect-ratio: 3 / 2; background: var(--thumb); outline: 1px solid var(--line); outline-offset: 8px; overflow: hidden; }
  .info { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .kind { display: flex; align-items: center; gap: 8px; font: 12px var(--font-mono); text-transform: uppercase; color: var(--accent); }
  .title { font-size: clamp(56px, 8vw, 120px); line-height: 0.8; overflow-wrap: anywhere; }
  .desc { margin: 0; max-width: 640px; font-size: 15px; line-height: 1.55; white-space: pre-line; }
  .stats { display: flex; gap: 28px; }
  .actions { margin-top: auto; display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .grid.albums { gap: 28px 22px; padding-top: 12px; }

  .empty, .missing {
    padding: 32px 0;
    font: 12px var(--font-mono);
    color: var(--text2);
    text-transform: uppercase;
  }
  .missing a { color: var(--accent); }

  @media (max-width: 800px) {
    .head { grid-template-columns: 1fr; }
  }
</style>
