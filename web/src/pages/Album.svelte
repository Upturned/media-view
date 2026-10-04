<script lang="ts">
  import type { FolderDetail, InboxSummary } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import Breadcrumbs from '../components/Breadcrumbs.svelte';
  import DescriptionEditor from '../components/DescriptionEditor.svelte';
  import DropOverlay from '../components/DropOverlay.svelte';
  import FolderActions from '../components/FolderActions.svelte';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import { fmt } from '../media.ts';
  import { folderHref, href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { drag, importDrop } from '../stores/imports.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { useSearchContext } from '../stores/search.svelte.ts';
  import { toast } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';

  /**
   * An album, or "View all images" under a category / sub-category (`all`), as one grid
   * (user guide §4.4). The Inbox uses this page too.
   */
  let { all = false }: { all?: boolean } = $props();

  const id = $derived(Number(router.route.params.id));
  let folder = $state<(FolderDetail & Partial<InboxSummary>) | null>(null);
  let notFound = $state(false);
  let starred = $state(0);
  let shown = $state<number | null>(null);

  $effect(() => {
    void live.folders;
    void live.files;
    const current = id;
    unwrap(client.api.folders[':id'].$get({ param: { id: String(current) } }))
      .then((detail) => {
        if (current !== id) return;
        // Categories and sub-categories have their own page, unless we're showing everything under them.
        if (!all && detail.kind !== 'album' && detail.kind !== 'inbox') {
          navigate(folderHref(detail).slice(1), { replace: true });
          return;
        }
        folder = detail;
        notFound = false;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) notFound = true;
        else toast((err as Error).message, 'error');
      });
    unwrap(client.api.files.$get({ query: { folder: String(current), recursive: all ? '1' : '0', favorites: '1', limit: '1' } }))
      .then((r) => (starred = r.total))
      .catch(() => {});
  });

  const isInbox = $derived(folder?.kind === 'inbox');
  const DAY = 24 * 60 * 60 * 1000;
  const oldestDays = $derived(folder?.oldestAddedAt ? Math.max(0, Math.floor((Date.now() - folder.oldestAddedAt) / DAY)) : null);
  // Images can be added to an album or the Inbox, not to "View all".
  const addTo = $derived(folder && !all ? { id: folder.id, label: folder.name } : undefined);
  /** The album and the folders above it: an image here can be the cover of any of them. */
  const coverTargets = $derived(
    folder ? [{ id: folder.id, kind: folder.kind, name: folder.name }, ...[...folder.ancestors].reverse()].filter((c) => c.kind !== 'inbox') : [],
  );
  const diskPath = $derived(
    folder && library.info ? `${library.info.path.replace(/[\\/]+$/, '')}\\Images\\${folder.relPath.replaceAll('/', '\\')}\\` : '',
  );

  function onDragOver(e: DragEvent) {
    if (addTo && e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }

  function onDrop(e: DragEvent) {
    if (!addTo || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    void importDrop(e.dataTransfer, addTo);
  }

  // The top-bar search filters this grid.
  const searchLabel = $derived(folder ? (all ? `all in ${folder.name}` : folder.name) : null);
  $effect(() => {
    if (searchLabel) return useSearchContext(searchLabel);
  });

  async function saveDescription(text: string) {
    if (!folder) return;
    try {
      folder = await unwrap(client.api.folders[':id'].$patch({ param: { id: String(folder.id) }, json: { description: text } }));
    } catch (err) {
      toast((err as Error).message, 'error');
      throw err;
    }
  }

  const crumbs = $derived(folder ? [...folder.ancestors, { id: folder.id, kind: folder.kind, name: folder.name }] : []);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="album-page" ondragover={onDragOver} ondrop={onDrop}>
  {#if notFound}
    <p class="missing">This folder no longer exists. <a href={href('/images')}>Back to the Library</a></p>
  {:else if folder}
    <header class="head">
      <Breadcrumbs {crumbs} linkLast={all} />
      <div class="row">
        <h1 class="display title">
          {#if all}<span class="all">All {word('images')} in</span>{/if}
          {folder.name}
          {#if isInbox}<span class="hint">select · move to an album</span>{/if}
        </h1>
        {#if !all}
          <FolderActions folder={{ id: folder.id, name: folder.name, kind: folder.kind, parentId: folder.parentId }} parent={folder.ancestors.at(-1)} />
        {/if}
        <div class="stats">
          {#if isInbox}
            <div class="stat"><b class="accent">{fmt(folder.imageCount)}</b>waiting</div>
            <div class="stat"><b>{fmt(folder.newThisWeek ?? 0)}</b>new this week</div>
            <div class="stat"><b>{oldestDays === null ? '—' : `${oldestDays}D`}</b>oldest</div>
          {:else}
            <div class="stat"><b>{fmt(shown ?? folder.imageCount)}</b>{word('images')}</div>
            <div class="stat"><b class="starred">{fmt(starred)}</b>starred</div>
          {/if}
        </div>
      </div>
      {#if !all && !isInbox}
        <div class="desc"><DescriptionEditor text={folder.description} compact max={500} prompt="What’s in this album?" onsave={saveDescription} /></div>
      {/if}
    </header>

    {#key `${folder.id}-${all}`}
      <ImageBrowser
        scope={{ folder: folder.id, recursive: all }}
        where={all ? `all images in ${folder.name}` : folder.name}
        {coverTargets}
        {addTo}
        emptyText={isInbox ? 'The Inbox is empty.' : all ? 'No images under here yet.' : 'This album is empty.'}
        ontotal={(n) => (shown = n)}
      />
    {/key}
    {#if drag.files && addTo}
      <DropOverlay target={diskPath} headline={'Drop to add\nthem here.'} body="Copied in, originals untouched. Folders are flattened into this album." />
    {/if}
  {/if}
</div>

<style>
  /* Fills the window under the top bar; only the grid scrolls. */
  .album-page { position: relative; height: calc(100vh - 56px); display: flex; flex-direction: column; }

  .head { padding: 20px 32px 16px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }
  .row { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; }
  .title { flex: 1; min-width: 0; font-size: clamp(40px, 5vw, 64px); line-height: 0.9; overflow-wrap: anywhere; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 20px; }
  .all { font-size: 0.45em; color: var(--text2); }
  .hint { font: 12px var(--font-mono); letter-spacing: 0; color: var(--text2); }
  .stats { display: flex; gap: 24px; }
  .desc { max-width: 760px; padding-top: 4px; }
  .stat b.accent { color: var(--accent); }
  .stat b.starred { color: var(--accent2); }

  .missing { padding: 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .missing a { color: var(--accent); }
</style>
