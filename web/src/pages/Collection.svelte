<script lang="ts">
  import type { CollectionDetail } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import ListIcon from '../components/ListIcon.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { fmt, viewerHref } from '../media.ts';
  import { href, navigate, router } from '../router.svelte.ts';
  import { deleteCollection } from '../stores/collections.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { useSearchContext } from '../stores/search.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';

  /**
   * A collection (user guide §4.11, design M6 · 02): its header, then its images in the list's own
   * order — numbered, reordered by drag — with the usual grid tools.
   */
  const id = $derived(Number(router.route.params.id));
  let detail = $state<CollectionDetail | null>(null);
  let missing = $state(false);

  $effect(() => {
    void live.files;
    const current = id;
    unwrap(client.api.collections[':id'].$get({ param: { id: String(current) } }))
      .then((d) => {
        if (current !== id) return;
        detail = d;
        missing = false;
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) missing = true;
        else toastError(err);
      });
  });

  $effect(() => {
    if (detail) return useSearchContext(detail.name);
  });

  const listQuery = $derived({ collection: id, sort: 'position' as const, order: 'asc' as const });

  /** "2D", "5W": how long since the list last changed. */
  const since = $derived.by(() => {
    if (!detail) return '';
    const days = Math.floor((Date.now() - detail.updatedAt) / 86_400_000);
    return days < 1 ? 'Today' : days < 14 ? `${days}D` : days < 120 ? `${Math.round(days / 7)}W` : `${Math.round(days / 30)}M`;
  });

  async function random() {
    try {
      const r = await unwrap(client.api.files.random.$get({ query: { collection: String(id), sort: 'position', order: 'asc' } }));
      if (r.id) navigate(viewerHref(r.id, listQuery).slice(1));
    } catch (err) {
      toastError(err);
    }
  }

  async function slideshow() {
    try {
      const r = await unwrap(client.api.files.$get({ query: { collection: String(id), sort: 'position', order: 'asc', limit: '1' } }));
      if (r.items[0]) navigate(`${viewerHref(r.items[0].id, listQuery).slice(1)}&play=1`);
    } catch (err) {
      toastError(err);
    }
  }

  async function remove() {
    if (detail && (await deleteCollection(detail))) navigate('/collections');
  }
</script>

{#if missing}
  <div class="page gone">
    <span class="display">This collection no longer exists.</span>
    <a href={href('/collections')}>← All collections</a>
  </div>
{:else if detail}
  {@const d = detail}
  <div class="coll-page">
    <header class="head">
      <div class="cover">
        {#if d.covers[0]}<Thumb file={d.covers[0]} fit="cover" />{/if}
        <span class="cover-tag">{d.count === 0 ? 'COVER · NONE YET' : d.coverFileId ? 'COVER · CHOSEN' : 'COVER · FIRST IMAGE'}</span>
      </div>
      <div class="info">
        <nav class="crumbs">
          <a href={href('/images')}>Images</a><span>/</span><a href={href('/collections')}>Collections</a><span>/</span>
          <span class="here"><ListIcon />{d.name}</span>
        </nav>
        <div class="row">
          <h1 class="display title">{d.name}</h1>
          <div class="stats">
            <div class="stat"><b>{fmt(d.count)}</b>{d.count === 1 ? 'image' : 'images'}</div>
            <div class="stat"><b>{fmt(d.albums.length)}</b>{d.albums.length === 1 ? 'album' : 'albums'}</div>
            <div class="stat"><b>{since}</b>since last change</div>
          </div>
        </div>
        {#if d.description}<p class="desc">{d.description}</p>{/if}
        <div class="actions">
          <button class="btn sm" onclick={() => openOps({ kind: 'collection-edit', id: d.id })}>Edit</button>
          <button class="btn sm danger" onclick={remove}>Delete</button>
          <button class="btn sm push" onclick={random} disabled={d.count === 0}>⚄ Random</button>
          <button class="btn sm primary" onclick={slideshow} disabled={d.count === 0}>▶ Slideshow</button>
        </div>
      </div>
    </header>

    {#key d.id}
      <ImageBrowser
        scope={{ collection: d.id }}
        collection={{ id: d.id, name: d.name }}
        where={d.name}
        emptyText="This list is empty — add images from any grid."
      />
    {/key}
  </div>
{/if}

<style>
  .coll-page { height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .gone { display: flex; flex-direction: column; gap: 12px; padding-top: 60px; }
  .gone .display { font-size: 48px; }
  .gone a { font: 12px var(--font-mono); color: var(--accent); text-transform: uppercase; text-decoration: none; }

  .head { display: grid; grid-template-columns: 196px minmax(0, 1fr); gap: 26px; padding: 18px 32px 16px; border-bottom: 1px solid var(--line); flex: none; }
  .cover { position: relative; aspect-ratio: 4 / 3; align-self: start; margin-top: 4px; background: var(--thumb); outline: 1px solid var(--line); outline-offset: 6px; overflow: hidden; }
  .cover-tag { position: absolute; left: 6px; bottom: 6px; font: 10px var(--font-mono); color: #fff; background: rgba(0, 0, 0, 0.45); padding: 2px 5px; }
  .info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .crumbs { display: flex; align-items: center; gap: 8px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; min-width: 0; }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs a:hover { color: var(--text); }
  .here { display: flex; align-items: center; gap: 5px; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row { display: flex; align-items: flex-end; gap: 28px; }
  .title { flex: 1; min-width: 0; font-size: clamp(40px, 5vw, 64px); line-height: 0.9; overflow-wrap: anywhere; }
  .stats { display: flex; gap: 24px; }
  .desc { margin: 0; max-width: 760px; font-size: 14px; line-height: 1.5; color: var(--text2); text-wrap: pretty; white-space: pre-line; }
  .actions { margin-top: auto; display: flex; }
  .btn.sm { height: 36px; padding: 0 16px; font-size: 14px; }
  .actions .btn + .btn:not(.push) { border-left: none; }
  .btn.danger { border-color: var(--red); color: var(--red); }
  .btn.danger:hover { border-color: var(--red); background: color-mix(in oklab, var(--red) 12%, transparent); }
  .push { margin-left: auto; }
</style>
