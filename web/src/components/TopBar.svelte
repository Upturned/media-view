<script lang="ts">
  import { href, router } from '../router.svelte.ts';
  import { live } from '../stores/events.svelte.ts';
  import { library } from '../stores/library.svelte.ts';
  import { openDialog } from '../stores/ui.svelte.ts';
  import { fmt } from '../media.ts';
  import { word } from '../themes/index.ts';
  import SearchBox from './SearchBox.svelte';

  // Random and the Health badge join as their milestones land.
  const scanning = $derived(live.scanning || library.info?.scan.status === 'scanning');
  const hashing = $derived(library.info?.scan.hashing ?? 0);
</script>

<header class="topbar">
  <a class="logo" href={href('/')} title="Hub"><span class="mark"></span>MEDIA/VIEW</a>

  {#if library.info}
    <SearchBox />
  {:else}
    <div class="spacer"></div>
  {/if}

  {#if scanning || hashing > 0}
    <span class="status" aria-live="polite" title={scanning ? 'Scanning the library for changes' : `Indexing ${fmt(hashing)} new ${word('images')}`}>
      <span class="pulse"></span>{scanning ? 'scanning' : `indexing ${fmt(hashing)}`}
    </span>
  {/if}

  <nav>
    <a href={href('/images')} class:active={router.route.path.startsWith('/images')}>Images</a>
    <a href={href('/tags')} class:active={router.route.name === 'tags' || router.route.name === 'tag-types' || router.route.name === 'tag'}>Tags</a>
    <a href={href('/collections')} class:active={router.route.name === 'collections' || router.route.name === 'collection'}>Collections</a>
    <a href={href('/favorites')} class:active={router.route.name === 'favorites'}>Favorites</a>
    <a href={href('/recycle')} class:active={router.route.name === 'recycle'}>Bin</a>
    <a href={href('/settings')} class:active={router.route.name === 'settings'}>Settings</a>
  </nav>
  <button class="theme" title="Check styles" onclick={() => openDialog('styles')}><span class="swatch"></span>Darkroom</button>
  <button class="help" title="Help (F1)" onclick={() => openDialog('help')}>?</button>
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: 56px;
    flex: none;
    display: flex;
    align-items: stretch;
    background: var(--bg2);
    border-bottom: 1px solid var(--line);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 22px;
    border-right: 1px solid var(--line);
    font: 700 22px/1 var(--font-display);
    letter-spacing: 0.02em;
    text-decoration: none;
  }
  .mark { width: 12px; height: 12px; background: var(--accent); }

  .spacer { flex: 1; }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-left: 1px solid var(--line);
    font: 11px var(--font-mono);
    color: var(--text2);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .pulse { width: 8px; height: 8px; background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.25; } }

  nav { display: flex; align-items: stretch; font: 600 13px/1 var(--font-display); letter-spacing: 0.06em; text-transform: uppercase; }
  nav a {
    display: flex;
    align-items: center;
    padding: 0 14px;
    color: var(--text2);
    border-left: 1px solid var(--line);
    text-decoration: none;
  }
  nav a:hover { color: var(--text); background: var(--surface); }
  nav a.active { color: var(--text); background: var(--surface); box-shadow: inset 0 -3px 0 var(--accent); }

  .theme {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border: none;
    border-left: 1px solid var(--line);
    background: none;
    color: var(--text2);
    font: 12px var(--font-mono);
    text-transform: uppercase;
    cursor: pointer;
  }
  .theme:hover { color: var(--text); background: var(--surface); }
  .swatch { width: 12px; height: 12px; border: 1.5px solid var(--text); background: linear-gradient(90deg, var(--text) 50%, transparent 50%); }

  .help {
    width: 52px;
    border: none;
    border-left: 1px solid var(--line);
    background: none;
    color: var(--text);
    font: 700 18px/1 var(--font-display);
    cursor: pointer;
  }
  .help:hover { background: var(--surface); }
</style>
