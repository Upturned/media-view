<script lang="ts">
  import type { TagDetail } from '@media-view/shared';
  import { ApiError, client, unwrap } from '../api.ts';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { fmt, viewerHref } from '../media.ts';
  import { href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { useSearchContext } from '../stores/search.svelte.ts';
  import { inkFor, typeColor, typeOf } from '../stores/tags.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';

  /** All images with a tag (design M4 · 07). The wiki page joins in milestone 5. */

  const id = $derived(Number(router.route.params.id));
  let tag = $state<TagDetail | null>(null);
  let missing = $state(false);

  $effect(() => {
    void live.files;
    const current = id;
    unwrap(client.api.tags[':id'].$get({ param: { id: String(current) } }))
      .then((t) => {
        if (current === id) {
          tag = t;
          missing = false;
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) missing = true;
        else toastError(err);
      });
  });

  const searchLabel = $derived(tag ? tag.name : null);
  $effect(() => {
    if (searchLabel) return useSearchContext(searchLabel);
  });

  const color = $derived(tag ? typeColor(tag.typeId) : 'var(--line)');
  const type = $derived(tag ? typeOf(tag.typeId) : undefined);

  async function random() {
    if (!tag) return;
    try {
      const r = await unwrap(client.api.files.random.$get({ query: { tag: String(tag.id), sort: 'name', order: 'asc' } }));
      if (r.id) navigate(viewerHref(r.id, { tag: tag.id, sort: 'name', order: 'asc' }).slice(1));
    } catch (err) {
      toastError(err);
    }
  }
</script>

<div class="gallery-page">
  {#if missing}
    <p class="missing">This tag no longer exists. <a href={href('/tags')}>All tags</a></p>
  {:else if tag}
    <header class="head" style:--c={color}>
      <div class="edge"></div>
      {#if tag.cover}
        <div class="cover"><Thumb file={tag.cover} fit="cover" /></div>
      {/if}
      <div class="info">
        <div class="crumbs">
          <span class="type" style:background={color} style:color={inkFor(color)}>{type?.name}</span>
          <a href={href('/tags')}>Tags</a><span>/</span><span>{type?.name}</span>
        </div>
        <h1 class="display name">{tag.name}</h1>
        {#if tag.aliases.length}<span class="aka">also known as <b>{tag.aliases.join(', ')}</b></span>{/if}
        <div class="bottom">
          <div class="stat"><b>{fmt(tag.count)}</b>{tag.count === 1 ? word('image') : word('images')}</div>
          {#if tag.implies.length}
            <div class="imp"><span>implies</span><div>{#each tag.implies as t (t.id)}<a href={href(`/tags/${t.id}/images`)} style:border-color={typeColor(t.typeId)}>{t.name}</a>{/each}</div></div>
          {/if}
          {#if tag.impliedBy.length}
            <div class="imp"><span>implied by</span><div>{#each tag.impliedBy as t (t.id)}<a href={href(`/tags/${t.id}/images`)} style:border-color={typeColor(t.typeId)}>{t.name}</a>{/each}</div></div>
          {/if}
          <div class="actions btn-group">
            <button class="btn" onclick={() => openOps({ kind: 'edit-tag', tagId: tag!.id })}>Edit tag</button>
            <button class="btn" onclick={random} disabled={tag.count === 0}>⚄ Random</button>
          </div>
        </div>
      </div>
    </header>
    {#key tag.id}
      <ImageBrowser scope={{ tag: tag.id }} where={`images tagged ${tag.name}`} emptyText="No images with this tag yet." />
    {/key}
  {/if}
</div>

<style>
  .gallery-page { height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .head { display: flex; border-bottom: 1px solid var(--line); flex: none; }
  .edge { width: 8px; background: var(--c); flex: none; }
  .cover { width: 160px; margin: 22px 0 22px 24px; aspect-ratio: 4 / 5; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; flex: none; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 22px 32px; }
  .crumbs { display: flex; align-items: center; gap: 10px; font: 11.5px var(--font-mono); text-transform: uppercase; color: var(--text2); }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs a:hover { color: var(--text); }
  .type { padding: 3px 8px; font: 700 13px/1.1 var(--font-display); letter-spacing: 0.08em; }
  .name { font-size: clamp(48px, 7vw, 104px); line-height: 0.82; overflow-wrap: anywhere; }
  .aka { font-size: 15px; color: var(--text2); }
  .aka b { color: var(--text); font-weight: 400; }
  .bottom { display: flex; align-items: flex-end; gap: 28px; flex-wrap: wrap; margin-top: auto; }
  .stat b { font-size: 40px; }
  .imp { display: flex; flex-direction: column; gap: 6px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .imp div { display: flex; gap: 4px; flex-wrap: wrap; }
  .imp a { padding: 3px 8px; border: 1px solid; color: var(--text); font: 13px var(--font-ui); text-transform: none; text-decoration: none; }
  .actions { margin-left: auto; }
  .missing { padding: 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .missing a { color: var(--accent); }
</style>
