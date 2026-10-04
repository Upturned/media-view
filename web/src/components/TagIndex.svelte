<script lang="ts">
  import { entryStateIn, parseQuery, setEntryState, type CollectionCount, type IndexEntry, type TagOp, type TagRef } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt, toParams, type ListQuery } from '../media.ts';
  import { navigate } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { search, setQuery } from '../stores/search.svelte.ts';
  import { groupByType, inkFor, tagTypeKey, typeKeys } from '../stores/tags.svelte.ts';
  import ListIcon from './ListIcon.svelte';

  /**
   * The index beside a grid (design M2 · 03, M6 · 08): the collections and the tags of the images
   * shown, with counts. Click cycles must → never → off; Ctrl + click toggles "any of"; a section's
   * title collapses it. It's a view of the search query. ↗ opens a collection.
   */
  let { query, exclude }: { query: ListQuery; exclude?: number } = $props();

  let tags = $state<(TagRef & { count: number })[]>([]);
  let collections = $state<CollectionCount[]>([]);
  let filter = $state('');

  function storedCollapsed(): string[] {
    try {
      return JSON.parse(localStorage.getItem('index.collapsed') ?? '[]') as string[];
    } catch {
      return [];
    }
  }
  let collapsed = $state<string[]>(storedCollapsed());
  function toggleSection(key: string) {
    collapsed = collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key];
    try {
      localStorage.setItem('index.collapsed', JSON.stringify(collapsed));
    } catch {
      // not remembered
    }
  }

  $effect(() => {
    void live.files;
    const params = toParams(query);
    unwrap(client.api.files['tag-counts'].$get({ query: params }))
      .then((r) => (tags = r.tags))
      .catch(() => (tags = []));
    unwrap(client.api.files['collection-counts'].$get({ query: params }))
      .then((r) => (collections = r.collections))
      .catch(() => (collections = []));
  });

  const tagEntry = (t: TagRef): IndexEntry => ({ kind: 'tag', typeKey: tagTypeKey(t), name: t.name });
  const listEntry = (c: CollectionCount): IndexEntry => ({ kind: 'collection', name: c.name });
  const stateOf = (e: IndexEntry): TagOp | null => entryStateIn(search.q, typeKeys(), e);

  const needle = $derived(filter.trim().toLowerCase());
  const shown = $derived(tags.filter((t) => !needle || t.name.toLowerCase().includes(needle)));
  const groups = $derived(groupByType(shown));
  // A collection page doesn't list itself: it would match every image.
  const lists = $derived(collections.filter((c) => c.id !== exclude && (!needle || c.name.toLowerCase().includes(needle))));
  const filterCount = $derived(parseQuery(search.q, typeKeys()).filter((t) => t.kind !== 'text' && t.name).length);

  function click(e: MouseEvent, entry: IndexEntry) {
    const now = stateOf(entry);
    const next: TagOp | null = e.ctrlKey || e.metaKey
      ? (now === 'any' ? null : 'any')
      : now === 'must' ? 'never' : now === 'never' ? null : 'must';
    setQuery(setEntryState(search.q, typeKeys(), entry, next));
  }

  function clear() {
    // Keep only the words; every tag and collection term goes, listed or typed by hand.
    const q = search.q;
    const kept = parseQuery(q, typeKeys()).filter((t) => t.kind === 'text').map((t) => q.slice(t.start, t.end));
    setQuery(kept.join(' '));
  }

  function tagMenu(e: MouseEvent, t: TagRef) {
    openMenu(e, t.name, [
      { label: 'Open wiki page', action: () => (location.hash = `#/tags/${t.id}`) },
      { label: 'Show all images', action: () => (location.hash = `#/tags/${t.id}/images`) },
      { label: 'Edit tag…', action: () => openOps({ kind: 'edit-tag', tagId: t.id }) },
      { label: 'Only this tag', separated: true, action: () => setQuery(setEntryState('', typeKeys(), tagEntry(t), 'must')) },
    ]);
  }

  function listMenu(e: MouseEvent, c: CollectionCount) {
    openMenu(e, c.name, [
      { label: 'Open collection', action: () => navigate(`/collections/${c.id}`) },
      { label: 'Edit collection…', action: () => openOps({ kind: 'collection-edit', id: c.id }) },
      { label: 'Only this collection', separated: true, action: () => setQuery(setEntryState('', typeKeys(), listEntry(c), 'must')) },
    ]);
  }
</script>

{#snippet mark(st: TagOp | null)}
  <span class="mark {st ?? 'off'}">{st === 'must' ? '+' : st === 'never' ? '×' : st === 'any' ? '~' : ''}</span>
{/snippet}

<aside class="index">
  <div class="head">
    <div class="title">
      <span class="display">Index</span>
      <span class="meta">{fmt(tags.length)} tags · {fmt(lists.length)} lists</span>
    </div>
    <input bind:value={filter} placeholder="filter…" spellcheck="false" />
    <div class="legend">
      <span><span class="mark must">+</span>must</span>
      <span><span class="mark never">×</span>never</span>
      <span><span class="mark any">~</span>any of</span>
    </div>
    {#if filterCount > 0}
      <button class="clear" onclick={clear}>✕ clear {filterCount} — open the floodgates</button>
    {/if}
  </div>
  <div class="list">
    {#if lists.length > 0}
      <button class="group lists" onclick={() => toggleSection('collections')} title="Collapse or expand">
        <ListIcon size={11} />Collections<span>{lists.length}</span><span class="fold">{collapsed.includes('collections') ? '+' : '−'}</span>
      </button>
      {#if !collapsed.includes('collections')}
        {#each lists as c (c.id)}
          {@const st = stateOf(listEntry(c))}
          <div class="row-wrap">
            <button class="tag list-row" class:never={st === 'never'} class:must={st === 'must'} class:any={st === 'any'}
              onclick={(e) => click(e, listEntry(c))} oncontextmenu={(e) => listMenu(e, c)}
              title="Click: must → never → off · Ctrl+click: any of">
              {@render mark(st)}
              <span class="name">{c.name}</span>
              <span class="count">{fmt(c.count)}</span>
            </button>
            <a class="open" href="#/collections/{c.id}" title="Open this collection">↗</a>
          </div>
        {/each}
      {/if}
    {/if}
    {#each groups as g (g.type.id)}
      {@const key = `type:${g.type.id}`}
      <button class="group" style:background={g.type.color} style:color={inkFor(g.type.color)} onclick={() => toggleSection(key)} title="Collapse or expand">
        {g.type.name}<span>{g.tags.length}</span><span class="fold">{collapsed.includes(key) ? '+' : '−'}</span>
      </button>
      {#if !collapsed.includes(key)}
        {#each g.tags as t (t.id)}
          {@const st = stateOf(tagEntry(t))}
          <button class="tag" class:never={st === 'never'} class:active={!!st} onclick={(e) => click(e, tagEntry(t))} oncontextmenu={(e) => tagMenu(e, t)}
            title="Click: must → never → off · Ctrl+click: any of">
            {@render mark(st)}
            <span class="name">{t.name}</span>
            <span class="count">{fmt(t.count)}</span>
          </button>
        {/each}
      {/if}
    {:else}
      <div class="none">No tags on these images yet.</div>
    {/each}
  </div>
</aside>

<style>
  .index { width: 300px; flex: none; display: flex; flex-direction: column; border-left: 1px solid var(--line); background: var(--surface); min-height: 0; }
  .head { padding: 16px 18px 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }
  .title { display: flex; align-items: baseline; justify-content: space-between; }
  .title .display { font-size: 26px; }
  .meta { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  input { height: 30px; padding: 0 10px; border: 1px solid var(--line); background: var(--bg2); color: var(--text); font: 12px var(--font-mono); outline: none; }
  .legend { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .legend > span { display: flex; align-items: center; gap: 5px; }
  .clear { align-self: flex-start; padding: 0; border: none; background: none; color: var(--accent); font: 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .list { flex: 1; overflow-y: auto; overflow-x: hidden; padding-bottom: 24px; }
  .group {
    position: sticky;
    top: 0;
    z-index: 2;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 18px;
    border: none;
    font: 700 14px/1.2 var(--font-display);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
  }
  .group span { margin-left: auto; font: 11px var(--font-mono); }
  .group .fold { margin-left: 0; width: 12px; text-align: center; }
  .group.lists { background: var(--text); color: var(--bg); }
  .tag { width: 100%; display: flex; align-items: center; gap: 9px; padding: 4px 18px 4px 14px; border: none; border-bottom: 1px solid color-mix(in oklab, var(--line) 50%, transparent); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; user-select: none; }
  .tag:hover { background: var(--surface2); }
  .tag.active { background: color-mix(in oklab, var(--text) 6%, transparent); }
  .row-wrap { position: relative; display: flex; align-items: center; border-bottom: 1px solid color-mix(in oklab, var(--line) 50%, transparent); }
  .list-row { flex: 1; min-width: 0; padding-right: 8px; border-bottom: none; }
  .list-row.must { background: color-mix(in oklab, var(--text) 16%, transparent); }
  .list-row.any { background: color-mix(in oklab, var(--blue) 12%, transparent); }
  .open { width: 22px; height: 22px; flex: none; margin-right: 10px; display: grid; place-items: center; border: 1px solid var(--line); color: var(--text2); font: 11px var(--font-mono); text-decoration: none; }
  .open:hover { color: var(--text); border-color: var(--text); }
  .name { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag.never .name { text-decoration: line-through; opacity: 0.6; }
  .count { font: 11px var(--font-mono); color: var(--text2); }
  .mark { width: 12px; height: 12px; flex: none; font: 700 10px/12px sans-serif; text-align: center; border: 1px solid var(--line); }
  .mark.must { border: none; background: var(--text); color: var(--bg); }
  .mark.never { border: none; background: var(--red); color: #fff; }
  .mark.any { border: 1px dashed var(--blue); color: var(--blue); line-height: 10px; }
  .none { padding: 16px 18px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
</style>
