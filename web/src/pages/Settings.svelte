<script lang="ts">
  import type { SortKey } from '@media-view/shared';
  import LibraryActions from '../components/LibraryActions.svelte';
  import ProfilesSettings from '../components/ProfilesSettings.svelte';
  import { segmented } from '../kbd.svelte.ts';
  import { DEFAULTS, INTERVALS, pref, store, type PrefKey } from '../prefs.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';
  import { themes } from '../themes/index.ts';

  /** Grids open with these (changing them on a grid changes them here too); the slideshow uses the rest. */
  const COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const SORTS: [SortKey, string][] = [['name', 'Name'], ['modified', 'Date modified'], ['added', 'Date added'], ['size', 'File size'], ['format', 'Format'], ['random', 'Random']];

  let p = $state(Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, pref(k as PrefKey)])) as typeof DEFAULTS);
  function set<K extends PrefKey>(key: K, value: (typeof DEFAULTS)[K]) {
    p[key] = value;
    store(key, value);
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Settings</h1>
  </div>

  <section class="panel">
    <h2 class="label">Library</h2>
    {#if library.info}
      <div class="current">
        <div class="name">{library.info.name}</div>
        <div class="mono path">{library.info.path}</div>
      </div>
    {:else}
      <p class="muted">No library is open.</p>
    {/if}
    <LibraryActions />
  </section>

  {#if library.info}<ProfilesSettings />{/if}

  <section class="panel">
    <h2 class="label">Grids</h2>
    <p class="muted intro">What album, tag and search grids open with, for your profile. Changing them on a grid changes them here too.</p>
    <div class="row">
      <span class="key">Columns</span>
      <div class="seg" use:segmented>
        {#each COLS as n (n)}<button class:on={p['grid.cols'] === n} onclick={() => set('grid.cols', n)}>{n}</button>{/each}
      </div>
    </div>
    <div class="row">
      <span class="key">Sort</span>
      <div class="seg" use:segmented>
        {#each SORTS as [k, label] (k)}<button class:on={p['grid.sort'] === k} onclick={() => set('grid.sort', k)}>{label}</button>{/each}
      </div>
      <div class="seg dir" use:segmented>
        <button class:on={p['grid.order'] === 'asc'} disabled={p['grid.sort'] === 'random'} onclick={() => set('grid.order', 'asc')} title="Ascending">↑</button>
        <button class:on={p['grid.order'] === 'desc'} disabled={p['grid.sort'] === 'random'} onclick={() => set('grid.order', 'desc')} title="Descending">↓</button>
      </div>
    </div>
    <div class="row">
      <span class="key">Group</span>
      <div class="seg" use:segmented>
        <button class:on={p['grid.group'] === 'none'} onclick={() => set('grid.group', 'none')}>None</button>
        <button class:on={p['grid.group'] === 'collection'} onclick={() => set('grid.group', 'collection')}>By collection</button>
        <button class:on={p['grid.group'] === 'format'} onclick={() => set('grid.group', 'format')}>By format</button>
      </div>
    </div>
    <div class="row">
      <span class="key">Index</span>
      <div class="seg" use:segmented>
        <button class:on={p['grid.index']} onclick={() => set('grid.index', true)}>Shown</button>
        <button class:on={!p['grid.index']} onclick={() => set('grid.index', false)}>Hidden</button>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2 class="label">Slideshow</h2>
    <p class="muted intro">The viewer’s ▶ Slideshow. Its controls change these too.</p>
    <div class="row">
      <span class="key">Each image</span>
      <div class="seg" use:segmented>
        {#each INTERVALS as s (s)}<button class:on={p['viewer.interval'] === s} onclick={() => set('viewer.interval', s)}>{s}s</button>{/each}
      </div>
    </div>
    <div class="row">
      <span class="key">At the end</span>
      <div class="seg" use:segmented>
        <button class:on={p['viewer.loop']} onclick={() => set('viewer.loop', true)}>Start over</button>
        <button class:on={!p['viewer.loop']} onclick={() => set('viewer.loop', false)}>Stop</button>
      </div>
    </div>
    <div class="row">
      <span class="key">Order</span>
      <div class="seg" use:segmented>
        <button class:on={!p['viewer.shuffle']} onclick={() => set('viewer.shuffle', false)}>The list’s order</button>
        <button class:on={p['viewer.shuffle']} onclick={() => set('viewer.shuffle', true)}>Shuffle</button>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2 class="label">Theme</h2>
    {#each themes as t (t.id)}
      <div class="theme">
        <span class="swatch" style:background={t.vars['--bg']} style:border-color={t.vars['--accent']}></span>
        <div>
          <div class="name">{t.name}</div>
          <div class="muted">{t.description}</div>
        </div>
      </div>
    {/each}
    <p class="muted">Other styles are being considered. Preview them with <em>Check styles</em>.</p>
    <button class="btn" onclick={() => openDialog('styles')}>Check styles</button>
  </section>
</div>

<style>
  section { padding: 24px; margin-bottom: 16px; }
  h2 { margin-bottom: 16px; }
  .current { margin-bottom: 20px; }
  .name { font-weight: 600; font-size: 17px; }
  .path, .muted { color: var(--text2); }
  .muted { font-size: 13px; }
  .theme { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .swatch { width: 40px; height: 40px; border: 2px solid; border-radius: var(--radius); }
  /* Grids and Slideshow (design M8 · 2C): labels in one column, each row one joined control. */
  .intro { margin: -6px 0 10px; }
  .row { display: flex; align-items: flex-start; gap: 14px; padding: 10px 0; border-top: 1px solid var(--surface2); }
  .row > .key { flex: none; width: 96px; font-size: 14px; line-height: 26px; }
  .seg { display: inline-flex; flex-wrap: wrap; }
  .seg button { position: relative; height: 26px; padding: 0 8px; margin: 0 -1px -1px 0; border: 1px solid var(--line); background: transparent; color: var(--text2); font: 10px var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
  .seg button:hover:not(:disabled) { color: var(--text); }
  .seg button.on { background: var(--text); color: var(--bg2); border-color: var(--text); }
  .seg button:disabled { opacity: 0.4; cursor: default; }
  .seg.dir button { width: 26px; padding: 0; font-size: 12px; }
</style>
