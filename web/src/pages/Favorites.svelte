<script lang="ts">
  import { client, unwrap } from '../api.ts';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import { fmt } from '../media.ts';
  import { live } from '../stores/events.svelte.ts';
  import { useSearchContext } from '../stores/search.svelte.ts';
  import { word } from '../themes/index.ts';

  /**
   * Favorites (user guide §4.12): every starred image, wherever it lives, in one grid. A view, not a
   * folder — starring an image doesn't move or copy it.
   */

  let total = $state<number | null>(null);
  let shown = $state<number | null>(null);

  $effect(() => {
    void live.files;
    unwrap(client.api.files.$get({ query: { favorites: '1', sort: 'name', order: 'asc', limit: '1' } }))
      .then((r) => (total = r.total))
      .catch(() => {});
  });

  $effect(() => useSearchContext('Favorites'));
</script>

<div class="fav-page">
  <header class="head">
    <div class="row">
      <h1 class="display title"><span class="star">★</span>Favorites</h1>
      <div class="stats">
        <div class="stat"><b class="starred">{fmt(total ?? 0)}</b>starred</div>
        {#if shown !== null && total !== null && shown !== total}
          <div class="stat"><b>{fmt(shown)}</b>shown</div>
        {/if}
      </div>
    </div>
    <p class="note">Every starred {word('image')}, wherever it lives. Starred images are protected from recycling; unstar one to take it off this page.</p>
  </header>

  <ImageBrowser scope={{ favorites: true }} where="Favorites" emptyText="Nothing starred yet." ontotal={(n) => (shown = n)} />
</div>

<style>
  .fav-page { height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .head { padding: 20px 32px 16px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--line); flex: none; }
  .row { display: flex; align-items: flex-end; gap: 28px; }
  .title { flex: 1; font-size: clamp(40px, 5vw, 64px); line-height: 0.9; display: flex; align-items: baseline; gap: 14px; }
  .star { color: var(--accent2); }
  .stats { display: flex; gap: 24px; }
  .stat b.starred { color: var(--accent2); }
  .note { margin: 0; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
</style>
