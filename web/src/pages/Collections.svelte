<script lang="ts">
  import type { CollectionCard as Card } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import CollectionCard from '../components/CollectionCard.svelte';
  import ListIcon from '../components/ListIcon.svelte';
  import { fmt } from '../media.ts';
  import { href } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';

  /** Collections (user guide §4.10, design M6 · 01): every list as a numbered contact strip. */

  type SortKey = 'name' | 'count' | 'changed';
  const SORTS: [SortKey, string][] = [['name', 'Name'], ['count', 'Images'], ['changed', 'Recently changed']];

  function stored<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  let all = $state<Card[] | null>(null);
  let sort = $state<SortKey>(stored('collections.sort', 'name'));
  let asc = $state(stored('collections.asc', true));
  let q = $state('');

  $effect(() => {
    try {
      localStorage.setItem('collections.sort', JSON.stringify(sort));
      localStorage.setItem('collections.asc', JSON.stringify(asc));
    } catch {
      // not remembered
    }
  });

  $effect(() => {
    void live.files;
    unwrap(client.api.collections.$get({ query: {} }))
      .then((r) => (all = r.collections))
      .catch(toastError);
  });

  // Sorting and filtering happen here: the whole list is small.
  const shown = $derived.by(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase().replace(/_/g, ' ');
    const list = all.filter((c) => !needle || c.name.toLowerCase().includes(needle));
    list.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        : sort === 'count' ? a.count - b.count
        : b.updatedAt - a.updatedAt);
    return asc ? list : list.reverse();
  });
  const listed = $derived(all?.reduce((n, c) => n + c.count, 0) ?? 0);

  function pickSort(k: SortKey) {
    sort = k;
    asc = k !== 'count';
  }

  const create = (name?: string) => openOps({ kind: 'collection-edit', id: null, name });
</script>

<div class="page">
  <nav class="crumbs">
    <a href={href('/images')}>Images</a><span>/</span><span class="here"><ListIcon />Collections</span>
  </nav>

  <header class="head">
    <h1 class="display title">Collections</h1>
    <div class="facts">
      <span><b>{fmt(all?.length ?? 0)}</b> collections · <b>{fmt(listed)}</b> images listed</span>
      <span>lists, not places — nothing is moved or copied</span>
    </div>
    <button class="btn primary new" onclick={() => create()}>+ New collection</button>
  </header>

  {#if all && all.length > 0}
    <div class="bar">
      <span class="lbl">Sort</span>
      {#each SORTS as [k, label] (k)}
        <button class:on={sort === k} onclick={() => pickSort(k)}>{label}</button>
      {/each}
      <button class="arrow" onclick={() => (asc = !asc)} title={asc ? 'Ascending' : 'Descending'}>{asc ? '↑' : '↓'}</button>
      <input bind:value={q} placeholder="name contains…" spellcheck="false" />
      <span class="shown">{fmt(shown.length)} of {fmt(all.length)}</span>
    </div>

    {#if shown.length > 0}
      <div class="grid">
        {#each shown as c (c.id)}
          <CollectionCard collection={c} highlight={q} />
        {/each}
      </div>
    {:else}
      <div class="none">
        <span class="display">No list by that name.</span>
        <span>Nothing contains “{q.trim()}”. <button class="link" onclick={() => (q = '')}>Clear the filter</button> or make it:
          <button class="link" onclick={() => create(q.trim())}>+ New collection “{q.trim()}”</button></span>
      </div>
    {/if}
  {:else if all}
    <div class="empty">
      <div class="pitch">
        <span class="display big">No lists yet.</span>
        <p>A collection is an ordered list of images from anywhere in the library: a chapter’s references, a comic page by page, a wallpaper shortlist. Nothing gets moved or copied, and an image can be on as many lists as you like.</p>
        <div class="row">
          <button class="btn primary" onclick={() => create()}>+ New collection</button>
          <span class="hint">or select images in any grid → + Collection</span>
        </div>
      </div>
      <div class="ghost-sheet">
        <div class="ghost-cover">01</div>
        <div class="ghost-strip">{#each ['02', '03', '04', '05', '06'] as n (n)}<div>{n}</div>{/each}</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 20px; padding-top: 22px; }
  .crumbs { display: flex; align-items: center; gap: 8px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs a:hover { color: var(--text); }
  .here { display: flex; align-items: center; gap: 5px; color: var(--accent); }

  .head { display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: 18px; }
  .title { font-size: clamp(64px, 9vw, 120px); line-height: 0.8; }
  .facts { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .facts b { color: var(--text); font-weight: 400; }
  .new { margin-left: auto; }

  .bar { display: flex; align-items: stretch; height: 40px; border: 1px solid var(--line); font: 12px var(--font-mono); text-transform: uppercase; }
  .bar .lbl { display: flex; align-items: center; padding: 0 14px; color: var(--text2); border-right: 1px solid var(--line); }
  .bar button { padding: 0 14px; border: none; border-right: 1px solid var(--line); background: none; color: var(--text2); font: inherit; font-weight: 700; text-transform: uppercase; cursor: pointer; }
  .bar button.on { background: var(--text); color: var(--bg); }
  .bar .arrow { width: 40px; padding: 0; color: var(--accent); font-size: 15px; }
  .bar input { flex: 1; min-width: 0; padding: 0 16px; border: none; background: none; color: var(--text); font: inherit; text-transform: none; outline: none; }
  .shown { display: flex; align-items: center; padding: 0 16px; border-left: 1px solid var(--line); color: var(--text2); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 28px 22px; }

  .none { padding: 40px 0; display: flex; flex-direction: column; gap: 8px; font: 12px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .none .display { font-size: 48px; line-height: 1; color: var(--text); }
  .link { border: none; background: none; padding: 0; color: var(--accent); font: inherit; text-transform: uppercase; cursor: pointer; }
  .link:hover { color: var(--text); text-decoration: underline; }

  .empty { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 440px); gap: 56px; padding: 36px 0; align-items: center; }
  .pitch { display: flex; flex-direction: column; gap: 18px; }
  .big { font-size: clamp(64px, 8vw, 104px); }
  .pitch p { margin: 0; max-width: 580px; font-size: 16px; line-height: 1.55; color: var(--text2); text-wrap: pretty; }
  .row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
  .hint { font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .ghost-sheet { display: flex; flex-direction: column; gap: 6px; padding: 10px; background: var(--bg2); outline: 1px dashed var(--text2); }
  .ghost-cover { aspect-ratio: 16 / 9; border: 1px dashed var(--line); padding: 6px 8px; font: 700 18px var(--font-display); color: var(--line); }
  .ghost-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .ghost-strip div { aspect-ratio: 1; border: 1px dashed var(--line); display: grid; place-items: end start; padding: 2px 4px; font: 10px var(--font-mono); color: var(--line); }
</style>
