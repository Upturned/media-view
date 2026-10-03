<script lang="ts">
  import type { FileItem, InboxSummary } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import { fmt } from '../media.ts';
  import { href } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { word } from '../themes/index.ts';
  import KindIcon from './KindIcon.svelte';
  import Thumb from './Thumb.svelte';

  /** The Inbox, first on the Library page, with what's waiting (user guide §2.4). */
  let { inbox }: { inbox: InboxSummary } = $props();

  let latest: FileItem[] = $state([]);

  $effect(() => {
    void live.files;
    unwrap(client.api.files.$get({ query: { folder: String(inbox.id), sort: 'added', order: 'desc', limit: '6' } }))
      .then((r) => (latest = r.items))
      .catch(() => (latest = []));
  });

  const DAY = 24 * 60 * 60 * 1000;
  const oldestDays = $derived(inbox.oldestAddedAt ? Math.max(0, Math.floor((Date.now() - inbox.oldestAddedAt) / DAY)) : null);
  const link = $derived(href(`/images/a/${inbox.id}`));
</script>

<a class="inbox" href={link}>
  <div class="count-col">
    <span class="kind"><KindIcon kind="inbox" size={15} />Inbox</span>
    <span class="big display">{fmt(inbox.imageCount)}</span>
    <span class="kind plain">{inbox.imageCount === 1 ? word('image') : word('images')} waiting to be filed</span>
  </div>
  <div class="body">
    <span class="headline display">{inbox.imageCount > 0 ? 'Waiting to be filed.' : 'All filed. Nice.'}</span>
    <div class="strip">
      {#each { length: 6 } as _, i (i)}
        <div class="slot">{#if latest[i]}<Thumb file={latest[i]} fit="cover" />{/if}</div>
      {/each}
    </div>
    <span class="note">
      {#if inbox.imageCount > 0}
        {fmt(inbox.newThisWeek)} new this week{oldestDays !== null ? ` · oldest: ${oldestDays} ${oldestDays === 1 ? 'day' : 'days'}` : ''}
      {:else}
        New images land here when you don't say where they go
      {/if}
    </span>
  </div>
  <span class="open display">Open<br />the Inbox<br />→</span>
</a>

<style>
  .inbox {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: stretch;
    background: color-mix(in oklab, var(--accent) 16%, var(--bg2));
    border: 1px solid var(--accent);
    text-decoration: none;
    color: var(--text);
  }
  .count-col {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 28px;
    border-right: 1px solid var(--accent);
    min-width: 200px;
  }
  .kind { display: flex; align-items: center; gap: 8px; font: 12px var(--font-mono); text-transform: uppercase; color: var(--accent); }
  .kind.plain { color: var(--text); }
  .big { font-size: clamp(80px, 9vw, 150px); line-height: 0.78; color: var(--accent); letter-spacing: -0.02em; }
  .body { display: flex; flex-direction: column; gap: 14px; padding: 20px 28px; min-width: 0; }
  .headline { font-size: 34px; line-height: 1; }
  .strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
  .slot { aspect-ratio: 3 / 2; background: var(--bg2); outline: 1px solid color-mix(in oklab, var(--accent) 40%, transparent); overflow: hidden; }
  .note { font: 11px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .open {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 150px;
    padding: 0 16px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 22px;
    line-height: 1;
    text-align: center;
  }
  .inbox:hover .open { filter: brightness(1.08); }
</style>
