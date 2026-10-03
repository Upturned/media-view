<script lang="ts">
  import type { FolderDetail, InboxSummary } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import Breadcrumbs from '../components/Breadcrumbs.svelte';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import { fmt } from '../media.ts';
  import { folderHref, href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
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
  const crumbs = $derived(folder ? [...folder.ancestors, { id: folder.id, kind: folder.kind, name: folder.name }] : []);
</script>

<div class="album-page">
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
    </header>

    {#key `${folder.id}-${all}`}
      <ImageBrowser
        scope={{ folder: folder.id, recursive: all }}
        emptyText={isInbox ? 'The Inbox is empty.' : all ? 'No images under here yet.' : 'This album is empty.'}
        ontotal={(n) => (shown = n)}
      />
    {/key}
  {/if}
</div>

<style>
  /* Fills the window under the top bar; only the grid scrolls. */
  .album-page { height: calc(100vh - 56px); display: flex; flex-direction: column; }

  .head { padding: 20px 32px 16px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }
  .row { display: flex; align-items: flex-end; gap: 28px; }
  .title { flex: 1; min-width: 0; font-size: clamp(40px, 5vw, 64px); line-height: 0.9; overflow-wrap: anywhere; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 20px; }
  .all { font-size: 0.45em; color: var(--text2); }
  .hint { font: 12px var(--font-mono); letter-spacing: 0; color: var(--text2); }
  .stats { display: flex; gap: 24px; }
  .stat b.accent { color: var(--accent); }
  .stat b.starred { color: var(--accent2); }

  .missing { padding: 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .missing a { color: var(--accent); }
</style>
