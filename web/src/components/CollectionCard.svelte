<script lang="ts">
  import type { CollectionCard } from '@media-view/shared';
  import { fmt } from '../media.ts';
  import { ago, collectionHref } from '../stores/collections.svelte.ts';
  import ListIcon from './ListIcon.svelte';
  import Thumb from './Thumb.svelte';

  /**
   * A collection as a numbered contact strip (design M6 · 01): the cover as frame 01, the next four
   * frames, then how many more. Used on the Collections page and the Search page.
   */
  let { collection: c, highlight = '', surface = 'var(--bg2)' }: { collection: CollectionCard; highlight?: string; surface?: string } = $props();

  const pad = (n: number) => String(n).padStart(2, '0');

  const parts = $derived.by(() => {
    const q = highlight.trim().toLowerCase().replace(/_/g, ' ');
    const i = q ? c.name.toLowerCase().indexOf(q) : -1;
    return i < 0 ? { pre: c.name, hit: '', post: '' } : { pre: c.name.slice(0, i), hit: c.name.slice(i, i + q.length), post: c.name.slice(i + q.length) };
  });
  const firstLine = $derived(c.description?.split('\n')[0]?.trim() ?? '');
</script>

<a class="card" href={collectionHref(c.id)}>
  {#if c.count > 0}
    <div class="sheet" style:background={surface}>
      <div class="cover"><Thumb file={c.covers[0]} fit="cover" /><span class="n01">01</span></div>
      <div class="strip">
        {#each [1, 2, 3, 4] as k (k)}
          <div class="frame">
            {#if c.covers[k]}<Thumb file={c.covers[k]} fit="cover" /><span class="n">{pad(k + 1)}</span>{/if}
          </div>
        {/each}
        <div class="more">{c.count > 5 ? `+${fmt(c.count - 5)}` : '·'}</div>
      </div>
    </div>
  {:else}
    <div class="sheet empty" style:background={surface}>
      <div class="cover blank">This list is empty —<br />add images from any grid.</div>
      <div class="strip">
        {#each [2, 3, 4, 5, 6] as n (n)}<div class="ghost">{pad(n)}</div>{/each}
      </div>
    </div>
  {/if}
  <div class="meta">
    <span class="kind"><ListIcon size={11} />Collection<span class="when">{ago(c.updatedAt)}</span></span>
    <span class="name">{parts.pre}{#if parts.hit}<mark>{parts.hit}</mark>{/if}{parts.post}</span>
    <span class="count"><b>{fmt(c.count)}</b> {c.count === 1 ? 'image' : 'images'}</span>
    <span class="desc" class:none={!firstLine}>{firstLine || 'No description yet.'}</span>
  </div>
</a>

<style>
  .card { display: flex; flex-direction: column; gap: 10px; min-width: 0; text-decoration: none; color: var(--text); }
  .sheet { display: flex; flex-direction: column; gap: 6px; padding: 8px; outline: 1px solid var(--line); }
  .card:hover .sheet { outline: 2px solid var(--accent); }
  .sheet.empty { outline: 1px dashed var(--text2); }
  .cover { position: relative; aspect-ratio: 16 / 9; background: var(--thumb); overflow: hidden; }
  .cover.blank { display: grid; place-items: center; padding: 12px; text-align: center; font: 10.5px/1.5 var(--font-mono); color: var(--text2); text-transform: uppercase; background: none; }
  .n01 { position: absolute; top: 0; left: 0; padding: 4px 7px; background: var(--bg2); font: 700 18px/1 var(--font-display); color: var(--accent); }
  .strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .frame { position: relative; aspect-ratio: 1; background: var(--thumb); overflow: hidden; }
  .n { position: absolute; left: 0; bottom: 0; padding: 1px 4px; background: var(--bg2); font: 700 10px var(--font-mono); color: var(--text2); }
  .more { display: grid; place-items: center; aspect-ratio: 1; border: 1px solid var(--line); font: 11px var(--font-mono); color: var(--text2); }
  .ghost { aspect-ratio: 1; border: 1px dashed var(--line); display: grid; place-items: end start; padding: 2px 4px; font: 10px var(--font-mono); color: var(--line); }

  .meta { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .kind { display: flex; align-items: center; gap: 6px; font: 10.5px var(--font-mono); text-transform: uppercase; color: var(--text2); }
  .when { margin-left: auto; }
  .name { font: 700 26px/0.95 var(--font-display); text-transform: uppercase; text-wrap: pretty; overflow-wrap: anywhere; }
  mark { background: color-mix(in oklab, var(--accent) 35%, transparent); color: inherit; }
  .count { font: 11.5px var(--font-mono); color: var(--text2); }
  .count b { color: var(--text); font-weight: 400; }
  .desc { font-size: 13px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .desc.none { color: color-mix(in oklab, var(--text2) 60%, transparent); }
</style>
