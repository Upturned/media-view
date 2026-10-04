<script lang="ts">
  import { collectionNameProblem, normTagName, type CollectionCard } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { addToCollection, ago, createAndAdd } from '../stores/collections.svelte.ts';
  import { closeOps, type OpsDialog } from '../stores/ops.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import { word } from '../themes/index.ts';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * Add images to a collection (design M6 · 04): pick a list (type to filter; the three last added to
   * on top) or type a new name to create one. Each row says how many of the images it already has.
   */
  let { dialog }: { dialog: Extract<OpsDialog, { kind: 'add-to-collection' }> } = $props();

  const NEW = -1;
  let all = $state<CollectionCard[]>([]);
  let have = $state(new Map<number, number>());
  let q = $state('');
  let selected = $state<number | null>(null);
  let busy = $state(false);
  let input: HTMLInputElement;

  const n = $derived(dialog.files.length);
  const ids = $derived(dialog.files.map((f) => f.id));

  $effect(() => {
    input.focus();
    Promise.all([
      unwrap(client.api.collections.$get({ query: {} })),
      unwrap(client.api.collections.membership.$post({ json: { ids: dialog.files.map((f) => f.id) } })),
    ])
      .then(([list, m]) => {
        all = list.collections;
        have = new Map(m.counts.map((c) => [c.id, c.count]));
        selected ??= recent[0]?.id ?? byName[0]?.id ?? null;
      })
      .catch(toastError);
  });

  const needle = $derived(q.trim().toLowerCase().replace(/_/g, ' '));
  const byName = $derived(
    all.filter((c) => !needle || c.name.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  );
  const recent = $derived(needle ? [] : all.filter((c) => c.lastAddedAt !== null).sort((a, b) => b.lastAddedAt! - a.lastAddedAt!).slice(0, 3));
  const exact = $derived(q.trim() ? all.find((c) => normTagName(c.name) === normTagName(q)) : undefined);
  const canCreate = $derived(!!q.trim() && !exact && !collectionNameProblem(q));

  // Typing picks the first match, or the new list when nothing matches.
  $effect(() => {
    if (!needle) return;
    selected = exact?.id ?? byName[0]?.id ?? (canCreate ? NEW : null);
  });

  const chosen = $derived(selected !== null && selected !== NEW ? all.find((c) => c.id === selected) : undefined);
  const pad = (k: number) => String(k).padStart(2, '0');

  async function go(target: number | null = selected) {
    if (busy || target === null) return;
    busy = true;
    try {
      if (target === NEW) {
        if (!canCreate) return;
        await createAndAdd(q.trim(), ids);
      } else {
        const c = all.find((x) => x.id === target);
        if (!c) return;
        await addToCollection(c, ids);
      }
      closeOps();
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void go();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const order = [...(canCreate ? [NEW] : []), ...recent.map((c) => c.id), ...byName.map((c) => c.id)];
      const i = selected === null ? -1 : order.indexOf(selected);
      const j = Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      if (order[j] !== undefined) selected = order[j]!;
    }
  }

  function coverage(c: CollectionCard): { text: string; strong: boolean; pct: number } {
    const k = have.get(c.id) ?? 0;
    if (n === 1) return { text: k ? 'already here' : '', strong: false, pct: k ? 100 : 0 };
    if (!k) return { text: 'none here yet', strong: false, pct: 0 };
    if (k === n) return { text: `all ${fmt(n)} already here`, strong: false, pct: 100 };
    return { text: `${fmt(k)} of ${fmt(n)} already here`, strong: true, pct: Math.round((k / n) * 100) };
  }

  function parts(name: string) {
    const i = needle ? name.toLowerCase().indexOf(needle) : -1;
    return i < 0 ? { pre: name, hit: '', post: '' } : { pre: name.slice(0, i), hit: name.slice(i, i + needle.length), post: name.slice(i + needle.length) };
  }

  const foot = $derived.by(() => {
    if (selected === NEW) return `Creates “${q.trim()}”, then adds ${n === 1 ? 'the image' : `all ${fmt(n)}`}`;
    if (!chosen) return 'New images go at the end of the list';
    const k = have.get(chosen.id) ?? 0;
    return k ? `${fmt(k)} already in it stay put · the other ${fmt(n - k)} go at the end` : `They go at the end, after ${pad(chosen.count)}`;
  });
  const goLabel = $derived(selected === NEW && canCreate ? `Create & add ${fmt(n)}` : chosen ? `Add to ${chosen.name}` : 'Pick a collection');
</script>

{#snippet row(c: CollectionCard)}
  {@const cov = coverage(c)}
  {@const p = parts(c.name)}
  <button class="row" class:on={selected === c.id} onclick={() => (selected = c.id)} ondblclick={() => go(c.id)}>
    <div class="thumb">{#if c.covers[0]}<Thumb file={c.covers[0]} fit="cover" />{/if}</div>
    <div class="names">
      <span class="name">{p.pre}{#if p.hit}<mark>{p.hit}</mark>{/if}{p.post}</span>
      <span class="meta">{fmt(c.count)} {c.count === 1 ? 'image' : 'images'} · {ago(c.updatedAt)}</span>
    </div>
    <div class="cov">
      <span class:strong={cov.strong}>{cov.text}</span>
      {#if n > 1}<div class="bar"><div style:width="{cov.pct}%"></div></div>{/if}
    </div>
  </button>
{/snippet}

<DialogFrame
  title={n === 1 ? `Add ${dialog.files[0]!.filename} to a collection` : `Add ${fmt(n)} ${word('images')} to a collection`}
  sub="from {dialog.where} · nothing is moved or copied"
  width={700}
  height={700}
  onclose={closeOps}
>
  <div class="search">
    <span class="prompt">&gt;</span>
    <input bind:this={input} bind:value={q} onkeydown={onKey} placeholder="filter, or type a new name…" spellcheck="false" />
    <span class="total">{fmt(all.length)} collections</span>
  </div>
  <div class="list">
    {#if canCreate}
      <button class="row new" class:on={selected === NEW} onclick={() => (selected = NEW)} ondblclick={() => go(NEW)}>
        <span class="plus">+</span>
        <span class="new-name">New collection “{q.trim()}”</span>
        <span class="new-note">creates it, then adds {fmt(n)}</span>
      </button>
    {/if}
    {#if recent.length}
      <span class="sec">Recent · last added to</span>
      {#each recent as c (c.id)}{@render row(c)}{/each}
    {/if}
    <span class="sec">{needle ? `Matching “${q.trim()}”` : 'All · a→z'}</span>
    {#each byName as c (c.id)}{@render row(c)}{/each}
    {#if needle && byName.length === 0}<span class="none">No collection contains “{q.trim()}”.</span>{/if}
    {#if !needle && all.length === 0}<span class="none">No collections yet — type a name to create the first one.</span>{/if}
  </div>

  {#snippet footer()}
    <span class="foot">{foot}</span>
    <button class="dbtn" onclick={closeOps}>Cancel</button>
    <button class="dbtn primary go" disabled={busy || (selected === NEW ? !canCreate : !chosen)} onclick={() => go()}>{goLabel}</button>
  {/snippet}
</DialogFrame>

<style>
  .search { display: flex; align-items: center; gap: 8px; padding: 0 20px; height: 44px; border-bottom: 1px solid var(--line); flex: none; }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  .search input { flex: 1; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .total { font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .list { flex: 1; overflow-y: auto; overflow-x: hidden; background: var(--bg2); padding-bottom: 8px; display: flex; flex-direction: column; }
  .sec { display: block; padding: 12px 20px 6px; font: 10.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .row {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) 200px;
    align-items: center;
    gap: 14px;
    min-height: 52px;
    padding: 0 20px;
    border: none;
    border-left: 3px solid transparent;
    border-bottom: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover { background: var(--surface); }
  .row.on { background: var(--surface2); border-left-color: var(--accent); }
  .thumb { height: 36px; background: var(--thumb); outline: 1px solid var(--line); overflow: hidden; }
  .names { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .name { font: 700 18px/1 var(--font-display); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  mark { background: color-mix(in oklab, var(--accent) 35%, transparent); color: inherit; }
  .meta { font: 10.5px var(--font-mono); color: var(--text2); }
  .cov { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .cov .strong { color: var(--text); }
  .bar { width: 120px; height: 4px; background: var(--surface2); }
  .bar div { height: 100%; background: var(--text); }
  .row.new { display: flex; gap: 14px; border-bottom: 1px solid var(--line); }
  .plus { width: 56px; height: 36px; flex: none; display: grid; place-items: center; border: 1px dashed var(--accent); color: var(--accent); font: 700 18px var(--font-mono); }
  .new-name { flex: 1; min-width: 0; font: 700 18px/1 var(--font-display); text-transform: uppercase; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .new-note { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .none { padding: 8px 20px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .foot { flex: 1; min-width: 0; font: 11px/1.4 var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .go { max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
</style>
