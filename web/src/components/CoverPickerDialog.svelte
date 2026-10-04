<script lang="ts">
  import type { CollectionRef, FileItem } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt, formatSize } from '../media.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * Choose a collection's cover (design M6 · 03): only its own images, in list order; filter by
   * file name. Double-click uses an image right away.
   */
  let { collection, current, onuse, onclose }: {
    collection: CollectionRef;
    current: number | null;
    /** null = back to the first image */
    onuse: (fileId: number | null) => void;
    onclose: () => void;
  } = $props();

  const LIMIT = 500;
  const pad = (n: number) => String(n).padStart(2, '0');
  let q = $state('');
  let items = $state<FileItem[]>([]);
  let total = $state(0);
  // svelte-ignore state_referenced_locally
  let selectedId = $state<number | null>(current);
  let input: HTMLInputElement;

  $effect(() => {
    input.focus();
  });

  $effect(() => {
    const text = q.trim();
    const t = setTimeout(() => {
      unwrap(client.api.files.$get({ query: { collection: String(collection.id), sort: 'position', order: 'asc', name: text || undefined, limit: String(LIMIT) } }))
        .then((r) => {
          items = r.items;
          total = r.total;
          if (selectedId === null && r.items[0]) selectedId = r.items[0].id;
        })
        .catch(toastError);
    }, text ? 200 : 0);
    return () => clearTimeout(t);
  });

  const selected = $derived(items.find((f) => f.id === selectedId));
</script>

<DialogFrame title="Choose image · Cover" sub="for {collection.name} · only this collection’s images · the file stays where it is" width={1120} height={780} {onclose}>
  <div class="search">
    <span class="prompt">&gt;</span>
    <input bind:this={input} bind:value={q} placeholder="filter this collection by file name…" spellcheck="false" />
  </div>
  <div class="split">
    <div class="list">
      <div class="sec"><span class="sq"></span><span class="sec-title">In {collection.name}</span><span class="sec-n">{fmt(total)} · in list order</span></div>
      <div class="grid">
        {#each items as f (f.id)}
          <button class="tile" class:on={f.id === selectedId} title={f.filename} onclick={() => (selectedId = f.id)} ondblclick={() => onuse(f.id)}>
            <Thumb file={f} />
            <span class="n">{pad(f.position ?? 0)}</span>
            {#if f.id === current}<span class="cur">CURRENT</span>{/if}
          </button>
        {/each}
      </div>
      <div class="note">No “Everywhere” section here. A collection’s cover has to be one of its own images.</div>
    </div>
    <aside class="side">
      {#if selected}
        <div class="preview"><Thumb file={selected} /></div>
        <span class="fname">{selected.filename}</span>
        <dl>
          <dt>IN</dt><dd>{selected.where ?? '—'}</dd>
          <dt>SIZE</dt><dd>{formatSize(selected.size)}</dd>
          <dt>POSITION</dt><dd class="pos">{pad(selected.position ?? 0)}</dd>
        </dl>
      {/if}
    </aside>
  </div>

  {#snippet footer()}
    <button class="dbtn" onclick={() => onuse(null)}>Use first image instead</button>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={!selected} onclick={() => selected && onuse(selected.id)}>Use as cover</button>
  {/snippet}
</DialogFrame>

<style>
  .search { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border-bottom: 1px solid var(--line); flex: none; }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  .search input { flex: 1; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .split { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
  .list { overflow-y: auto; background: var(--bg2); padding: 0 0 20px; }
  .sec { position: sticky; top: 0; z-index: 2; display: flex; align-items: baseline; gap: 10px; padding: 12px 20px 8px; background: var(--bg2); }
  .sq { width: 10px; height: 10px; background: var(--text); }
  .sec-title { font: 700 18px/1 var(--font-display); text-transform: uppercase; }
  .sec-n { font: 11px var(--font-mono); color: var(--text2); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; padding: 0 20px; }
  .tile { position: relative; aspect-ratio: 1; padding: 0; border: none; background: var(--thumb); outline: 1px solid var(--line); cursor: pointer; overflow: hidden; }
  .tile:hover { outline: 2px solid var(--text); }
  .tile.on { outline: 3px solid var(--accent); }
  .n { position: absolute; top: 0; left: 0; padding: 2px 5px; background: var(--bg2); font: 700 13px/1 var(--font-display); color: var(--accent); }
  .cur { position: absolute; bottom: 0; left: 0; padding: 2px 5px; background: var(--text); color: var(--bg); font: 700 9.5px var(--font-mono); }
  .note { margin: 22px 20px 0; padding: 14px 16px; border: 1px dashed var(--line); font: 11.5px/1.6 var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .side { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-left: 1px solid var(--line); min-width: 0; }
  .preview { aspect-ratio: 4 / 5; background: var(--thumb); outline: 1px solid var(--line); }
  .fname { font: 700 18px/1.05 var(--font-display); overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: 84px 1fr; margin: 0; font: 11.5px var(--font-mono); border-top: 1px solid var(--line); }
  dt, dd { margin: 0; padding: 5px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  dt { color: var(--text2); }
  .pos { color: var(--accent); }
</style>
