<script lang="ts">
  import type { FileItem } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { toastError } from '../stores/toasts.svelte.ts';
  import DialogFrame from './DialogFrame.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * Choose a profile picture (docs/profiles.md §4.3): your favorites first, or any image with a search
   * (the search syntax works: `#tag`, `@collection`). Shown as a square crop. Double-click uses it.
   */
  let { current, onuse, onclose }: {
    current: number | null;
    /** null = no picture (initials) */
    onuse: (fileId: number | null) => void;
    onclose: () => void;
  } = $props();

  const LIMIT = 120;
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
      const query = text
        ? { q: text, sort: 'added' as const, order: 'desc' as const, limit: String(LIMIT) }
        : { favorites: '1' as const, sort: 'added' as const, order: 'desc' as const, limit: String(LIMIT) };
      unwrap(client.api.files.$get({ query }))
        .then((r) => {
          items = r.items;
          total = r.total;
        })
        .catch(toastError);
    }, text ? 200 : 0);
    return () => clearTimeout(t);
  });
</script>

<DialogFrame title="Choose image · Profile picture" sub="any image in the library · shown as a square · the file stays where it is" width={960} height={720} {onclose}>
  <div class="search">
    <span class="prompt">&gt;</span>
    <input bind:this={input} bind:value={q} placeholder="search the library… (#tag, @collection, file names)" spellcheck="false" />
  </div>
  <div class="list">
    <div class="sec">
      <span class="sq"></span><span class="sec-title">{q.trim() ? 'Everywhere' : 'Your favorites'}</span>
      <span class="sec-n">{fmt(total)}{total > LIMIT ? ` · first ${LIMIT}` : ''}</span>
    </div>
    {#if items.length}
      <div class="grid">
        {#each items as f (f.id)}
          <button class="tile" class:on={f.id === selectedId} title={f.filename} onclick={() => (selectedId = f.id)} ondblclick={() => onuse(f.id)}>
            <Thumb file={f} fit="cover" />
            {#if f.id === current}<span class="cur">CURRENT</span>{/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">{q.trim() ? 'Nothing matches.' : 'No favorites yet: search for an image instead.'}</p>
    {/if}
  </div>

  {#snippet footer()}
    <button class="dbtn" onclick={() => onuse(null)}>No picture (initials)</button>
    <button class="dbtn push" onclick={onclose}>Cancel</button>
    <button class="dbtn primary" disabled={selectedId === null} onclick={() => selectedId !== null && onuse(selectedId)}>Use as picture</button>
  {/snippet}
</DialogFrame>

<style>
  .search { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; border-bottom: 1px solid var(--line); flex: none; }
  .prompt { color: var(--accent); font: 700 13px var(--font-mono); }
  .search input { flex: 1; height: 100%; border: none; background: none; color: var(--text); font: 13px var(--font-mono); outline: none; }
  .list { flex: 1; min-height: 0; overflow-y: auto; background: var(--bg2); padding: 0 0 20px; }
  .sec { position: sticky; top: 0; z-index: 2; display: flex; align-items: baseline; gap: 10px; padding: 12px 20px 8px; background: var(--bg2); }
  .sq { width: 10px; height: 10px; background: var(--text); }
  .sec-title { font: 700 18px/1 var(--font-display); text-transform: uppercase; }
  .sec-n { font: 11px var(--font-mono); color: var(--text2); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; padding: 0 20px; }
  .tile { position: relative; aspect-ratio: 1; padding: 0; border: none; background: var(--thumb); outline: 1px solid var(--line); cursor: pointer; overflow: hidden; }
  .tile:hover { outline: 2px solid var(--text); }
  .tile.on { outline: 3px solid var(--accent); }
  .cur { position: absolute; bottom: 0; left: 0; padding: 2px 5px; background: var(--text); color: var(--bg); font: 700 9.5px var(--font-mono); }
  .empty { margin: 20px; color: var(--text2); font-size: 14px; }
</style>
