<script lang="ts">
  import { parseQuery, setTagState, tagStateIn, type TagOp, type TagRef } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt, toParams, type ListQuery } from '../media.ts';
  import { live } from '../stores/events.svelte.ts';
  import { openMenu } from '../stores/menu.svelte.ts';
  import { openOps } from '../stores/ops.svelte.ts';
  import { search, setQuery } from '../stores/search.svelte.ts';
  import { groupByType, inkFor, tagTypeKey, tagTypes, typeKeys } from '../stores/tags.svelte.ts';

  /**
   * The tag index beside a grid (design M2 · 03 "Index"): the tags of the images shown, with counts.
   * Click cycles must → never → off; Ctrl + click toggles "any of". It's a view of the search query.
   */
  let { query }: { query: ListQuery } = $props();

  let tags = $state<(TagRef & { count: number })[]>([]);
  let filter = $state('');

  $effect(() => {
    void live.files;
    const params = toParams(query);
    unwrap(client.api.files['tag-counts'].$get({ query: params }))
      .then((r) => (tags = r.tags))
      .catch(() => (tags = []));
  });

  const stateOf = (t: TagRef): TagOp | null => tagStateIn(search.q, typeKeys(), { typeKey: tagTypeKey(t), name: t.name });
  const shown = $derived(tags.filter((t) => !filter.trim() || t.name.toLowerCase().includes(filter.trim().toLowerCase())));
  const groups = $derived(groupByType(shown));
  const filterCount = $derived(parseQuery(search.q, typeKeys()).filter((t) => t.kind === 'tag' && t.name).length);

  function click(e: MouseEvent, t: TagRef) {
    const now = stateOf(t);
    const next: TagOp | null = e.ctrlKey || e.metaKey
      ? (now === 'any' ? null : 'any')
      : now === 'must' ? 'never' : now === 'never' ? null : 'must';
    setQuery(setTagState(search.q, typeKeys(), { typeKey: tagTypeKey(t), name: t.name }, next));
  }

  function clear() {
    let q = search.q;
    for (const t of tags) q = setTagState(q, typeKeys(), { typeKey: tagTypeKey(t), name: t.name }, null);
    // Tags typed by hand that aren't in the list go too.
    const kept = parseQuery(q, typeKeys()).filter((t) => t.kind === 'text').map((t) => q.slice(t.start, t.end));
    setQuery(kept.join(' '));
  }

  function menu(e: MouseEvent, t: TagRef) {
    openMenu(e, t.name, [
      { label: 'Show all images', action: () => (location.hash = `#/tags/${t.id}/images`) },
      { label: 'Edit tag…', action: () => openOps({ kind: 'edit-tag', tagId: t.id }) },
      { label: 'Only this tag', separated: true, action: () => setQuery(setTagState('', typeKeys(), { typeKey: tagTypeKey(t), name: t.name }, 'must')) },
    ]);
  }
</script>

<aside class="index">
  <div class="head">
    <div class="title">
      <span class="display">Index</span>
      <span class="meta">{fmt(tags.length)} tags · {tagTypes.list.length} types</span>
    </div>
    <input bind:value={filter} placeholder="filter…" spellcheck="false" />
    <div class="legend">
      <span><span class="mark must">+</span>must</span>
      <span><span class="mark never">×</span>never</span>
      <span><span class="mark any">~</span>any of</span>
    </div>
    {#if filterCount > 0}
      <button class="clear" onclick={clear}>✕ clear {filterCount} {filterCount === 1 ? 'tag' : 'tags'}</button>
    {/if}
  </div>
  <div class="list">
    {#each groups as g (g.type.id)}
      <div class="group" style:background={g.type.color} style:color={inkFor(g.type.color)}>{g.type.name}<span>{g.tags.length}</span></div>
      {#each g.tags as t (t.id)}
        {@const st = stateOf(t)}
        <button class="tag" class:never={st === 'never'} class:active={!!st} onclick={(e) => click(e, t)} oncontextmenu={(e) => menu(e, t)}
          title="Click: must → never → off · Ctrl+click: any of">
          <span class="mark {st ?? 'off'}">{st === 'must' ? '+' : st === 'never' ? '×' : st === 'any' ? '~' : ''}</span>
          <span class="name">{t.name}</span>
          <span class="count">{fmt(t.count)}</span>
        </button>
      {/each}
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
  .group { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; padding: 5px 18px; font: 700 14px/1.2 var(--font-display); letter-spacing: 0.08em; text-transform: uppercase; }
  .group span { margin-left: auto; font: 11px var(--font-mono); }
  .tag { width: 100%; display: flex; align-items: center; gap: 9px; padding: 4px 18px 4px 14px; border: none; border-bottom: 1px solid color-mix(in oklab, var(--line) 50%, transparent); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; user-select: none; }
  .tag:hover { background: var(--surface2); }
  .tag.active { background: color-mix(in oklab, var(--text) 6%, transparent); }
  .name { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag.never .name { text-decoration: line-through; opacity: 0.6; }
  .count { font: 11px var(--font-mono); color: var(--text2); }
  .mark { width: 12px; height: 12px; flex: none; font: 700 10px/12px sans-serif; text-align: center; border: 1px solid var(--line); }
  .mark.must { border: none; background: var(--text); color: var(--bg); }
  .mark.never { border: none; background: var(--red); color: #fff; }
  .mark.any { border: 1px dashed var(--blue); color: var(--blue); line-height: 10px; }
  .none { padding: 16px 18px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
</style>
