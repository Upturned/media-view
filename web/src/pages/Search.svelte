<script lang="ts">
  import { textOf, type FileItem, type FolderCard, type TagSummary } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import FolderCardView from '../components/FolderCardView.svelte';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import KindIcon from '../components/KindIcon.svelte';
  import Thumb from '../components/Thumb.svelte';
  import { fmt, viewerHref } from '../media.ts';
  import { folderHref, href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { search, useSearchContext } from '../stores/search.svelte.ts';
  import { inkFor, typeColor, typeKeys, typeOf } from '../stores/tags.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';

  /**
   * The Search page (technical doc §11.2a): the whole library. "All" shows the first few results of
   * each kind, each with See all; the other tabs show one kind. Images use the full syntax (with the
   * tag index); folders and tags are matched by the plain words of the query.
   */

  type Tab = 'all' | 'images' | 'albums' | 'folders' | 'tags';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'images', label: 'Images' },
    { id: 'albums', label: 'Albums' },
    { id: 'folders', label: `${word('categories')} & ${word('subcategories')}` },
    { id: 'tags', label: 'Tags' },
  ];

  const initial = router.route.query.get('q') ?? '';
  $effect(() => useSearchContext('the whole library', 'search', initial));

  const tab = $derived((router.route.query.get('tab') as Tab | null) ?? 'all');

  // Keep the URL in step with the query (replace: typing isn't history).
  $effect(() => {
    const q = search.q;
    const want = `/search?q=${encodeURIComponent(q)}${tab !== 'all' ? `&tab=${tab}` : ''}`;
    if (location.hash !== `#${want}`) navigate(want, { replace: true });
  });

  function setTab(t: Tab) {
    navigate(`/search?q=${encodeURIComponent(search.q)}${t !== 'all' ? `&tab=${t}` : ''}`, { replace: true });
  }

  const words = $derived(textOf(search.q, typeKeys()));

  let images = $state<FileItem[]>([]);
  let imageTotal = $state(0);
  let folders = $state<(FolderCard & { path: string })[]>([]);
  let tags = $state<TagSummary[]>([]);

  $effect(() => {
    void live.files;
    void live.folders;
    const q = search.q;
    const w = words;
    if (!q.trim()) {
      images = [];
      imageTotal = 0;
      folders = [];
      tags = [];
      return;
    }
    unwrap(client.api.files.$get({ query: { q, sort: 'name', order: 'asc', limit: '12' } }))
      .then((r) => {
        images = r.items;
        imageTotal = r.total;
      })
      .catch(toastError);
    if (w) {
      unwrap(client.api.folders.search.$get({ query: { q: w } })).then((r) => (folders = r.folders)).catch(toastError);
      unwrap(client.api.tags.$get({ query: { q: w, sort: 'count' } })).then((r) => (tags = r.tags)).catch(toastError);
    } else {
      folders = [];
      tags = [];
    }
  });

  const albums = $derived(folders.filter((f) => f.kind === 'album'));
  const racks = $derived(folders.filter((f) => f.kind !== 'album'));
  const counts = $derived<Record<Tab, number>>({ all: imageTotal + folders.length + tags.length, images: imageTotal, albums: albums.length, folders: racks.length, tags: tags.length });
  const imageQuery = $derived({ q: search.q, sort: 'name' as const, order: 'asc' as const });
</script>

<div class="search-page">
  <header class="head">
    <div class="row">
      <h1 class="display title">Search</h1>
      <span class="sub">
        {#if search.q.trim()}Everywhere · “{search.q.trim()}”{:else}Type in the search box above — words, or #tags{/if}
      </span>
    </div>
    <div class="tabs">
      {#each TABS as t (t.id)}
        <button class:on={tab === t.id} onclick={() => setTab(t.id)}>
          <span class="label">{t.label}</span><span class="n">{search.q.trim() ? fmt(counts[t.id]) : ''}</span>
        </button>
      {/each}
    </div>
  </header>

  {#if !search.q.trim()}
    <div class="empty">
      <span class="display">What are you looking for?</span>
      <span>Words match file and folder names; <b>#tag</b> finds tags, <b>-#tag</b> leaves them out, <b>~#a ~#b</b> means either. Press F1 for the full syntax.</span>
    </div>
  {:else if tab === 'images'}
    <ImageBrowser scope={{}} where="search results" emptyText="No images match." />
  {:else}
    <div class="body">
      {#if tab === 'all'}
        <section>
          <div class="section-title"><strong>Images</strong><span>{fmt(imageTotal)} {imageTotal === 1 ? 'match' : 'matches'}</span>
            {#if imageTotal > 0}<button class="see" onclick={() => setTab('images')}>See all {fmt(imageTotal)} →</button>{/if}</div>
          {#if images.length}
            <div class="thumbs">
              {#each images as f (f.id)}
                <a class="thumb" href={viewerHref(f.id, imageQuery)} title={f.filename}><div class="frame"><Thumb file={f} /></div><span>{f.filename}</span></a>
              {/each}
            </div>
          {:else}<p class="none">No images match.</p>{/if}
        </section>
      {/if}

      {#if tab === 'all' || tab === 'albums'}
        <section>
          <div class="section-title"><strong>Albums</strong><span>{fmt(albums.length)}</span>
            {#if tab === 'all' && albums.length > 4}<button class="see" onclick={() => setTab('albums')}>See all {fmt(albums.length)} →</button>{/if}</div>
          {#if !words}<p class="none">Folders are matched by the words in your search.</p>
          {:else if albums.length}
            <div class="cards">
              {#each tab === 'all' ? albums.slice(0, 4) : albums as a (a.id)}
                <div class="card"><FolderCardView folder={a} parentId={null} /><span class="path">{a.path}</span></div>
              {/each}
            </div>
          {:else}<p class="none">No albums are named like that.</p>{/if}
        </section>
      {/if}

      {#if tab === 'all' || tab === 'folders'}
        <section>
          <div class="section-title"><strong>{word('categories')} &amp; {word('subcategories')}</strong><span>{fmt(racks.length)}</span>
            {#if tab === 'all' && racks.length > 4}<button class="see" onclick={() => setTab('folders')}>See all {fmt(racks.length)} →</button>{/if}</div>
          {#if !words}<p class="none">Folders are matched by the words in your search.</p>
          {:else if racks.length}
            <div class="rows">
              {#each tab === 'all' ? racks.slice(0, 4) : racks as f (f.id)}
                <a class="frow" href={folderHref(f)}>
                  <div class="fthumb"><Thumb file={f.covers[0]} fit="cover" /></div>
                  <span class="kind"><KindIcon kind={f.kind} size={12} />{f.kind === 'category' ? word('category') : word('subcategory')}</span>
                  <div class="fname"><span class="display">{f.name}</span><span class="path">{f.path || 'Images'}</span></div>
                  <span class="count">{fmt(f.imageCount)} {word('images')}</span>
                </a>
              {/each}
            </div>
          {:else}<p class="none">No {word('categories').toLowerCase()} or {word('subcategories').toLowerCase()} are named like that.</p>{/if}
        </section>
      {/if}

      {#if tab === 'all' || tab === 'tags'}
        <section>
          <div class="section-title"><strong>Tags</strong><span>{fmt(tags.length)}</span>
            {#if tab === 'all' && tags.length > 6}<button class="see" onclick={() => setTab('tags')}>See all {fmt(tags.length)} →</button>{/if}</div>
          {#if !words}<p class="none">Tags are matched by the words in your search.</p>
          {:else if tags.length}
            <div class="rows">
              {#each tab === 'all' ? tags.slice(0, 6) : tags as t (t.id)}
                {@const c = typeColor(t.typeId)}
                <a class="trow" href={href(`/tags/${t.id}/images`)}>
                  <span class="tbar" style:background={c}></span>
                  <div class="fname"><span class="display">{t.name}</span><span class="path">{t.aliases.length ? `aka ${t.aliases.join(', ')}` : ''}</span></div>
                  <span class="type" style:background={c} style:color={inkFor(c)}>{typeOf(t.typeId)?.name}</span>
                  <span class="count">{fmt(t.count)} {word('images')}</span>
                </a>
              {/each}
            </div>
          {:else}<p class="none">No tags are named like that.</p>{/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .search-page { height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .head { padding: 20px 32px 0; display: flex; flex-direction: column; gap: 14px; border-bottom: 1px solid var(--line); flex: none; }
  .row { display: flex; align-items: flex-end; gap: 24px; }
  .title { font-size: 64px; line-height: 0.9; }
  .sub { padding-bottom: 6px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .tabs { display: flex; flex-wrap: wrap; }
  .tabs button { display: flex; align-items: baseline; gap: 8px; padding: 10px 18px 12px; border: none; background: none; color: var(--text2); cursor: pointer; }
  .tabs button.on { color: var(--text); box-shadow: inset 0 -3px 0 var(--accent); }
  .tabs .label { font: 700 20px/1 var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; }
  .tabs .n { font: 11px var(--font-mono); }

  .body { flex: 1; overflow-y: auto; background: var(--bg2); padding: 8px 32px 64px; display: flex; flex-direction: column; gap: 28px; }
  section { display: flex; flex-direction: column; gap: 12px; padding-top: 16px; }
  .see { margin-left: auto; padding: 0; border: none; background: none; color: var(--accent); font: 12px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .none { margin: 0; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }

  .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .thumb { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: var(--text2); font: 10.5px var(--font-mono); min-width: 0; }
  .thumb span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .frame { aspect-ratio: 3 / 2; background: var(--thumb); outline: 1px solid var(--line); padding: 6px; }
  .thumb:hover .frame { outline-color: var(--accent); }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 28px 22px; padding-top: 12px; }
  .card { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .path { font: 11px var(--font-mono); color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .rows { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
  .frow, .trow { display: grid; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--line); text-decoration: none; color: var(--text); }
  .frow { grid-template-columns: 96px 140px minmax(0, 1fr) 140px; }
  .trow { grid-template-columns: 6px minmax(0, 1fr) 130px 140px; padding-left: 0; min-height: 60px; }
  .frow:hover, .trow:hover { background: var(--surface); }
  .fthumb { height: 56px; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .kind { display: flex; align-items: center; gap: 6px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .fname { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .fname .display { font-size: 24px; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tbar { align-self: stretch; }
  .type { justify-self: start; font: 10px var(--font-mono); padding: 2px 6px; text-transform: uppercase; }
  .count { font: 11.5px var(--font-mono); text-align: right; }

  .empty { flex: 1; display: flex; flex-direction: column; gap: 10px; padding: 60px 32px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .empty .display { font-size: 48px; color: var(--text); }
  .empty b { color: var(--text); font-weight: 400; text-transform: none; }
</style>
