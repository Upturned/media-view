<script lang="ts">
  import type { HealthReport } from '@media-view/shared';
  import { client, unwrap } from '../api.ts';
  import ImageBrowser from '../components/ImageBrowser.svelte';
  import { fmt } from '../media.ts';
  import { href, navigate, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { useSearchContext } from '../stores/search.svelte.ts';
  import { toastError } from '../stores/toasts.svelte.ts';

  /**
   * Untagged images as a grid (design M7 · 06): a view, not a folder — each image stays in its
   * album. Filter by album or to the NEW ones; tag in bulk from the selection bar.
   */
  let report = $state<HealthReport | null>(null);
  const fresh = $derived(router.route.query.get('fresh') === '1');
  const album = $derived(router.route.query.has('album') ? Number(router.route.query.get('album')) : undefined);

  $effect(() => {
    void live.health;
    unwrap(client.api.health.$get()).then((r) => (report = r)).catch(toastError);
  });
  $effect(() => useSearchContext('untagged images'));

  function go(next: { fresh?: boolean; album?: number }) {
    const q = new URLSearchParams();
    if (next.fresh) q.set('fresh', '1');
    if (next.album !== undefined) q.set('album', String(next.album));
    navigate(`/health/untagged/grid${q.size ? `?${q}` : ''}`, { replace: true });
  }
</script>

<div class="grid-page">
  <header class="head">
    <nav class="crumbs">
      <a href={href('/images')}>Library</a><span>/</span><a href={href('/health')}>Health</a><span>/</span><a href={href('/health/untagged')}>Untagged</a><span>/</span><span class="here">Grid</span>
    </nav>
    <div class="row">
      <h1 class="display title">Untagged images</h1>
      <div class="stats">
        <div class="stat"><b>{fmt(report?.summary.untagged ?? 0)}</b>untagged</div>
        <div class="stat"><b class="new">{fmt(report?.summary.fresh ?? 0)}</b>new from outside</div>
      </div>
    </div>
    <p class="note">A view, not a folder — each image stays in its album. Tag them here in bulk; tagged ones stay dimmed until you refresh.</p>
    <div class="chips">
      <button class:on={album === undefined} onclick={() => go({ fresh })}>All albums</button>
      {#each (report?.untaggedAlbums ?? []).slice(0, 12) as a (a.folderId)}
        <button class:on={album === a.folderId} onclick={() => go({ fresh, album: a.folderId })}>{a.path.split(' › ').at(-1)} <span>{fmt(a.count)}</span></button>
      {/each}
      <button class="newtoggle" class:on={fresh} onclick={() => go({ fresh: !fresh, album })}>{fresh ? '✓ ' : ''}NEW only</button>
    </div>
  </header>
  {#key `${fresh}-${album}`}
    <ImageBrowser scope={{ untagged: true, fresh, folder: album }} untaggedView where="untagged images" emptyText="Every frame has a name." />
  {/key}
</div>

<style>
  .grid-page { height: calc(100vh - 56px); display: flex; flex-direction: column; }
  .head { padding: 18px 32px 12px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); flex: none; }
  .crumbs { display: flex; align-items: center; gap: 8px; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .crumbs a { color: var(--text2); text-decoration: none; }
  .crumbs a:hover { color: var(--text); }
  .here { color: var(--accent); }
  .row { display: flex; align-items: flex-end; gap: 28px; }
  .title { flex: 1; font-size: clamp(40px, 5vw, 56px); line-height: 0.9; }
  .stats { display: flex; gap: 24px; }
  .stat b.new { color: var(--accent2); }
  .note { margin: 0; font: 11.5px var(--font-mono); color: var(--text2); text-transform: uppercase; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { height: 28px; padding: 0 10px; border: 1px solid var(--line); background: none; color: var(--text2); font: 700 11px var(--font-mono); text-transform: uppercase; cursor: pointer; }
  .chips button span { font-weight: 400; margin-left: 4px; }
  .chips button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  .chips .newtoggle { margin-left: auto; }
  .chips .newtoggle.on { background: var(--accent2); color: #111; border-color: var(--accent2); }
</style>
